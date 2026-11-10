"""UC13 HTTP/concurrency checks on uniquely named tempdb fixtures only."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import re
import sys
from threading import Barrier
from unittest.mock import patch
from uuid import uuid4

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'backend'))
from app import app
from database import get_connection
from services.jwt_service import create_access_token


def main(output):
    prefix='##UC13_'+uuid4().hex[:12]+'_'
    tables=('Users','Bookings','FootballFields','Payments','Invoices')
    def rewrite(sql):
        for name in tables:sql=re.sub(r'(?<![\w#])(?:dbo\.)?'+name+r'\b',prefix+name,sql)
        assert 'dbo.' not in sql,'Refused query against application schema'
        return sql
    class Cursor:
        def __init__(self,cur):self.cur=cur
        def execute(self,sql,*args):self.cur.execute(rewrite(sql),*args);return self
        def __getattr__(self,key):return getattr(self.cur,key)
    class Connection:
        def __init__(self,conn):self.conn=conn
        def cursor(self):return Cursor(self.conn.cursor())
        def __getattr__(self,key):return getattr(self.conn,key)
    def connection():
        conn=get_connection()
        if conn is None:raise RuntimeError('SQL unavailable')
        return Connection(conn)
    owner=get_connection()
    if owner is None:raise RuntimeError('SQL unavailable')
    cur=owner.cursor();checks=[]
    try:
        cur.execute(rewrite("""
            SET NOCOUNT ON;
            CREATE TABLE dbo.Users (UserID INT PRIMARY KEY,Username VARCHAR(30) UNIQUE,FullName NVARCHAR(100),
                Email VARCHAR(100),Phone VARCHAR(15),Role VARCHAR(20),Status VARCHAR(20),PasswordHash VARCHAR(100));
            CREATE TABLE dbo.FootballFields (FieldID INT,FieldName NVARCHAR(100),FieldType VARCHAR(30),IsArchived BIT);
            CREATE TABLE dbo.Bookings (BookingID INT,UserID INT,FieldID INT,BookingDate DATE,StartTime TIME,EndTime TIME,
                TotalAmount DECIMAL(18,2),Status VARCHAR(20));
            CREATE TABLE dbo.Payments (PaymentID INT,BookingID INT,Amount DECIMAL(18,2),Status VARCHAR(20));
            CREATE TABLE dbo.Invoices (InvoiceID INT,BookingID INT,Amount DECIMAL(18,2),PaidAmount DECIMAL(18,2));
            INSERT dbo.Users VALUES (1,'qa_admin','QA Admin','admin@example.invalid','0900000001','ADMIN','ACTIVE','fixture-hash-admin'),
                (2,'qa_alice',N'QA Alice','alice@example.invalid','0900000002','CUSTOMER','ACTIVE','fixture-hash-a'),
                (3,'qa_bob',N'QA Bob','bob@example.invalid','0900000003','CUSTOMER','ACTIVE','fixture-hash-b'),
                (4,'qa_inactive',N'QA Inactive','inactive@example.invalid','0900000004','CUSTOMER','INACTIVE','fixture-hash-c'),
                (5,'qa_staff','QA Staff','staff@example.invalid','0900000005','STAFF','ACTIVE','fixture-hash-staff');
            INSERT dbo.FootballFields VALUES (5,'QA Available','7 player',0),(6,'QA Archived','5 player',1);
            INSERT dbo.Bookings VALUES (10,2,5,'2026-11-01','18:00','19:00',350000,'COMPLETED'),
                (11,2,6,'2026-11-02','18:00','19:00',300000,'CANCELLED');
            INSERT dbo.Payments VALUES (20,10,100000,'SUCCESS');
            INSERT dbo.Invoices VALUES (30,10,350000,100000);
        """));owner.commit()
        snapshots={}
        for table in ('Bookings','Payments','Invoices'):
            cur.execute(rewrite('SELECT * FROM dbo.'+table));snapshots[table]=[tuple(row) for row in cur.fetchall()]
        owner.commit()
        with patch.dict(os.environ,{'JWT_SECRET':'uc13-sql-fixture-only'}),patch('services.customer_service.get_connection',side_effect=connection):
            client=app.test_client()
            def call(method,url,expected,payload=None,user=1,role='ADMIN'):
                headers={'Authorization':'Bearer '+create_access_token(user,role)}
                response=getattr(client,method)(url,json=payload,headers=headers)
                assert response.status_code==expected,(url,response.status_code,response.get_json())
                checks.append({'method':method,'path':url,'status':expected});return response.get_json()
            listing=call('get','/api/admin/customers',200)
            assert listing['total']==3 and all(row['role']=='CUSTOMER' for row in listing['items'])
            for keyword in ('alice','qa_alice','alice@example.invalid','0900000002'):
                data=call('get','/api/admin/customers?keyword='+keyword,200)
                assert len(data['items'])==1 and data['items'][0]['customerId']==2
            assert call('get','/api/admin/customers?keyword=not-found',200)['items']==[]
            assert call('get','/api/admin/customers?keyword=%25',200)['items']==[]
            assert call('get','/api/admin/customers?status=INACTIVE',200)['items'][0]['customerId']==4
            call('get','/api/admin/customers/1',404)
            customer=call('get','/api/admin/customers/2',200)
            assert 'passwordHash' not in customer
            history=call('get','/api/admin/customers/2/bookings',200)
            assert history['total']==2 and {r['fieldId'] for r in history['items']}=={5,6}
            assert call('get','/api/admin/customers/3/bookings',200)['items']==[]
            updated=call('put','/api/admin/customers/2',200,{'fullName':'  QA Alice Updated  '})
            assert updated['updatedFields']==['fullName'] and updated['customer']['email']=='alice@example.invalid'
            call('put','/api/admin/customers/2',409,{'email':'ADMIN@example.invalid'})
            call('put','/api/admin/customers/2',409,{'phone':'0900000003'})
            updated=call('put','/api/admin/customers/2',200,{'email':' New-Alice@Example.invalid ','phone':'0910000002'})
            assert updated['customer']['email']=='new-alice@example.invalid'
            call('put','/api/admin/customers/2',400,{'role':'ADMIN'})
            call('put','/api/admin/customers/2',400,{'status':'INACTIVE'})
            call('put','/api/admin/customers/2',400,{'phone':'bad'})
            call('get','/api/admin/customers',403,user=2,role='CUSTOMER')
            call('put','/api/admin/customers/2',403,{'fullName':'Hacked'},user=5,role='STAFF')
            call('get','/api/admin/customers',403,user=4,role='ADMIN')
            call('put','/api/admin/customers/4',200,{'fullName':'Inactive Contact Updated'})
            barrier=Barrier(2)
            def race(customer_id):
                with app.test_client() as concurrent_client:
                    token=create_access_token(1,'ADMIN');barrier.wait(timeout=10)
                    response=concurrent_client.put(f'/api/admin/customers/{customer_id}',json={'email':'shared@example.invalid'},headers={'Authorization':'Bearer '+token})
                    return response.status_code
            with ThreadPoolExecutor(max_workers=2) as pool:statuses=sorted(pool.map(race,[2,3]))
            assert statuses==[200,409],statuses
            checks.append({'case':'concurrent_contact_collision','statuses':statuses})
            cur.execute(rewrite("SELECT COUNT(*) FROM dbo.Users WHERE Email='shared@example.invalid'"))
            assert cur.fetchone()[0]==1;owner.commit()
            for table,original in snapshots.items():
                cur.execute(rewrite('SELECT * FROM dbo.'+table));assert [tuple(row) for row in cur.fetchall()]==original
            cur.execute(rewrite("SELECT Role,Status,Username,PasswordHash FROM dbo.Users WHERE UserID=2"))
            assert tuple(cur.fetchone())==('CUSTOMER','ACTIVE','qa_alice','fixture-hash-a')
            cur.execute(rewrite("SELECT Status FROM dbo.Users WHERE UserID=4"));assert cur.fetchone()[0]=='INACTIVE'
            owner.commit()
            # Real SQL pagination with deterministic customer ordering and no overlaps.
            first=call('get','/api/admin/customers?page=1&pageSize=2',200)
            second=call('get','/api/admin/customers?page=2&pageSize=2',200)
            assert not {r['customerId'] for r in first['items']}&{r['customerId'] for r in second['items']}
        result={'fixture_only':True,'live_table_writes':0,'history_unchanged':['Bookings','Payments','Invoices'],
                'protected_fields_unchanged':['Username','Role','Status','PasswordHash'],'checks':checks}
        if output:
            path=Path(output);path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(result,indent=2))
    finally:
        owner.rollback()
        for table in reversed(tables):
            name=prefix+table;assert name.startswith(prefix)
            cur.execute(f"IF OBJECT_ID('tempdb..{name}') IS NOT NULL DROP TABLE {name}")
        owner.commit();cur.close();owner.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output');args=parser.parse_args();main(args.output)
