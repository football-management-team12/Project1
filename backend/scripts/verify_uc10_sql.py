"""UC10 migration, HTTP and concurrent inserts using unique global #temp fixtures.

No application-table writes. The real migration is rewritten to ##UC10_<uuid>_
tables in tempdb. SQL Server ignores FKs on temporary tables, so this verification
covers unique/check constraints and behavior; permanent FK deployment needs QA.
"""
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

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/"backend"))
from app import app
from database import get_connection
from services.jwt_service import create_access_token


def main(output=None):
    prefix = "##UC10_" + uuid4().hex[:12] + "_"
    tables = ("BookingReviews","Bookings","FootballFields","Users")
    def rewrite(sql):
        for name in tables:
            sql = re.sub(r"(?<![\w#])(?:dbo\.)?" + name + r"\b", prefix+name,sql)
        sql = sql.replace("OBJECT_ID(N'##", "OBJECT_ID(N'tempdb..##").replace("COL_LENGTH('##","COL_LENGTH('tempdb..##")
        assert "dbo." not in sql, "Refused query against application schema"
        return sql
    owner=get_connection()
    if owner is None: raise RuntimeError("SQL Server unavailable")
    cursor=owner.cursor()
    names=[prefix+name for name in tables]
    checks=[]
    class Cursor:
        def __init__(self, cur): self.cur=cur
        def execute(self,sql,*args): self.cur.execute(rewrite(sql),*args); return self
        def __getattr__(self,name): return getattr(self.cur,name)
    class Connection:
        def __init__(self,conn): self.conn=conn
        def cursor(self): return Cursor(self.conn.cursor())
        def __getattr__(self,name): return getattr(self.conn,name)
    def connection():
        conn=get_connection()
        if conn is None: raise RuntimeError("Fixture connection failed")
        return Connection(conn)
    def drain():
        while cursor.nextset(): pass
    try:
        cursor.execute(rewrite("""
            SET NOCOUNT ON;
            CREATE TABLE dbo.Users (UserID INT PRIMARY KEY,Role VARCHAR(20),Status VARCHAR(20));
            CREATE TABLE dbo.FootballFields (FieldID INT PRIMARY KEY,FieldName NVARCHAR(100),IsArchived BIT);
            CREATE TABLE dbo.Bookings (BookingID INT PRIMARY KEY,UserID INT,FieldID INT,Status VARCHAR(20));
            INSERT dbo.Users VALUES (1,'CUSTOMER','ACTIVE'),(2,'CUSTOMER','ACTIVE'),(3,'ADMIN','ACTIVE'),(4,'CUSTOMER','INACTIVE');
            INSERT dbo.FootballFields VALUES (5,'QA Field A',0),(6,'QA Field B',0),(7,'QA Archived',1);
            INSERT dbo.Bookings VALUES (201,1,5,'COMPLETED'),(202,1,5,'PENDING'),(203,2,5,'COMPLETED'),
                (204,1,5,'CONFIRMED'),(205,1,5,'CANCELLED'),(206,1,5,'COMPLETED'),(207,1,7,'COMPLETED'),
                (208,1,5,'COMPLETED'),(209,1,6,'COMPLETED');
        """));drain();owner.commit()
        migration=rewrite((ROOT/'backend/migrations/011_uc10_booking_reviews.sql').read_text(encoding='utf-8'))
        # Named temporary constraints must also have an isolated name.
        migration=re.sub(r'\b(PK|FK|CK|DF|UQ|IX)_BookingReviews_?\w*', lambda m:m.group()+"_"+prefix[7:19],migration)
        for _ in range(2): cursor.execute(migration);drain()
        owner.commit()
        checks.append({"case":"migration_on_tempdb_fixtures_twice","passed":True,"foreign_keys_on_temp_tables":"not enforced by SQL Server"})
        with patch.dict(os.environ,{"JWT_SECRET":"uc10-sql-fixture-only"}),patch('services.review_service.get_connection',side_effect=connection):
            client=app.test_client()
            def call(method,path,status,payload=None,user=1,role='CUSTOMER'):
                headers={"Authorization":"Bearer "+create_access_token(user,role)} if user else {}
                response=getattr(client,method)(path,json=payload,headers=headers)
                assert response.status_code==status,(path,response.status_code,response.get_json())
                checks.append({"method":method,"path":path,"status":status})
                return response.get_json()
            review=call('post','/api/bookings/201/reviews',201,{"rating":5,"comment":"Sân tốt, đúng giờ"})
            assert review['bookingId']==201 and review['fieldId']==5
            call('post','/api/bookings/201/reviews',409,{"rating":1,"comment":"Duplicate"})
            cursor.execute(rewrite("SELECT COUNT(*),MIN(UserID),MIN(FieldID),MIN(Rating),MIN(Comment) FROM dbo.BookingReviews WHERE BookingID=201"))
            count,uid,fid,rating,comment=cursor.fetchone()
            assert (count,uid,fid,rating,comment)==(1,1,5,5,"Sân tốt, đúng giờ")
            owner.commit() # Release the read lock before other fixture requests.
            assert call('get','/api/bookings/201/reviews',200)['canReview'] is False
            for bid in (202,204,205): call('post',f'/api/bookings/{bid}/reviews',409,{"rating":5,"comment":"Ineligible"})
            call('post','/api/bookings/203/reviews',403,{"rating":5,"comment":"Not mine"})
            call('post','/api/bookings/999/reviews',404,{"rating":5,"comment":"Missing"})
            call('post','/api/bookings/206/reviews',403,{"rating":5,"comment":"Inactive"},user=4)
            call('post','/api/bookings/206/reviews',400,{"rating":0,"comment":"Invalid"})
            call('post','/api/bookings/206/reviews',400,{"rating":6,"comment":"Invalid"})
            call('post','/api/bookings/206/reviews',400,{"rating":5,"comment":" "})
            call('post','/api/bookings/206/reviews',201,{"rating":1,"comment":"x"*1000})
            call('post','/api/bookings/209/reviews',201,{"rating":4,"comment":"Other field"})
            barrier=Barrier(2)
            def concurrent_post(_):
                with app.test_client() as concurrent_client:
                    token=create_access_token(1,'CUSTOMER')
                    barrier.wait(timeout=10)
                    result=concurrent_client.post('/api/bookings/208/reviews',json={"rating":5,"comment":"Concurrent fixture"},headers={"Authorization":"Bearer "+token})
                    return result.status_code
            with ThreadPoolExecutor(max_workers=2) as pool:
                statuses=sorted(pool.map(concurrent_post,range(2)))
            assert statuses==[201,409],statuses
            checks.append({"case":"concurrent_same_booking","statuses":statuses})
            cursor.execute(rewrite("SELECT COUNT(*) FROM dbo.BookingReviews WHERE BookingID=208"))
            assert cursor.fetchone()[0]==1
            owner.commit()
            for index in range(11):
                cursor.execute(rewrite("INSERT dbo.Bookings VALUES (?,1,5,'COMPLETED')"),300+index)
                cursor.execute(rewrite("INSERT dbo.BookingReviews (BookingID,UserID,FieldID,Rating,Comment) VALUES (?,1,5,3,N'QA pagination')"),300+index)
            owner.commit()
            page1=call('get','/api/fields/5/reviews?page=1&pageSize=10',200,user=None)
            page2=call('get','/api/fields/5/reviews?page=2&pageSize=10',200,user=None)
            assert page1['total']==14 and page1['totalPages']==2
            assert len(page1['items'])==10 and len(page2['items'])==4
            ids1={r['reviewId'] for r in page1['items']};ids2={r['reviewId'] for r in page2['items']}
            assert not ids1&ids2
            assert all(r['fieldId']==5 and 'bookingId' not in r for r in page1['items']+page2['items'])
            call('get','/api/fields/7/reviews',404,user=None)
            call('get','/api/fields/999/reviews',404,user=None)
            call('get','/api/fields/5/reviews?page=0',400,user=None)
            # Actual SQL unique/check constraints independently reject invalid writes.
            for sql in ("INSERT dbo.BookingReviews (BookingID,UserID,FieldID,Rating,Comment) VALUES (201,1,5,5,N'Duplicate')",
                        "INSERT dbo.BookingReviews (BookingID,UserID,FieldID,Rating,Comment) VALUES (207,1,7,6,N'Invalid rating')"):
                try: cursor.execute(rewrite(sql));owner.commit()
                except Exception: owner.rollback()
                else: raise AssertionError('SQL constraint accepted invalid fixture')
        result={"fixture_only":True,"live_table_writes":0,"checks":checks}
        if output:
            output=Path(output);output.parent.mkdir(parents=True,exist_ok=True)
            output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(result,ensure_ascii=False,indent=2))
    finally:
        owner.rollback()
        for name in names:
            assert name.startswith(prefix)
            cursor.execute(f"IF OBJECT_ID('tempdb..{name}') IS NOT NULL DROP TABLE {name}")
        owner.commit();cursor.close();owner.close()


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output');args=parser.parse_args()
    main(args.output)
