"""UC13 ownership boundary, validation, read-only history and atomic contact edits."""
import os
import sys
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace as Row
from unittest.mock import MagicMock,patch
import pyodbc

sys.path.insert(0,str(Path(__file__).resolve().parents[2]/"backend"))
from app import app
from services.jwt_service import create_access_token


class AdminCustomerTests(unittest.TestCase):
    def setUp(self):
        env=patch.dict(os.environ,{"JWT_SECRET":"uc13-test-only"});env.start();self.addCleanup(env.stop)
        self.conn=MagicMock();self.cur=self.conn.cursor.return_value;self.cur.rowcount=1
        db=patch("services.customer_service.get_connection",return_value=self.conn);db.start();self.addCleanup(db.stop)
        self.client=app.test_client();self.admin=Row(Role="ADMIN",Status="ACTIVE")
        self.customer=Row(UserID=2,Username="qa_customer",FullName="QA Customer",Email="qa@example.invalid",Phone="0900000002",Role="CUSTOMER",Status="ACTIVE")
        self.headers={"Authorization":"Bearer "+create_access_token(1,"ADMIN")}

    def put(self,payload):return self.client.put('/api/admin/customers/2',json=payload,headers=self.headers)

    def writes(self):return [c.args for c in self.cur.execute.call_args_list if c.args[0].lstrip().startswith(('UPDATE','INSERT','DELETE'))]

    def test_role_matrix_all_endpoints(self):
        for role in ('CUSTOMER','STAFF'):
            headers={"Authorization":"Bearer "+create_access_token(2,role)}
            for url in ('/api/admin/customers','/api/admin/customers/2','/api/admin/customers/2/bookings'):
                self.assertEqual(self.client.get(url,headers=headers).status_code,403)
            self.assertEqual(self.client.put('/api/admin/customers/2',json={'fullName':'New'},headers=headers).status_code,403)
        self.assertEqual(self.client.get('/api/admin/customers').status_code,401)
        self.assertEqual(self.client.get('/api/admin/customers',headers={'Authorization':'Bearer invalid'}).status_code,401)
        self.conn.cursor.assert_not_called()

    def test_database_role_and_status_rechecked(self):
        for actor in (None,Row(Role='CUSTOMER',Status='ACTIVE'),Row(Role='ADMIN',Status='INACTIVE')):
            self.cur.fetchone.side_effect=[actor]
            self.assertEqual(self.client.get('/api/admin/customers/2',headers=self.headers).status_code,403)
        self.assertEqual(self.writes(),[])

    def test_search_customer_only_literal_keyword_and_pagination(self):
        self.cur.fetchone.side_effect=[self.admin,(1,)]
        self.cur.fetchall.return_value=[Row(**vars(self.customer),BookingCount=2)]
        response=self.client.get('/api/admin/customers?keyword=QA%25_&status=ACTIVE&page=2&pageSize=1',headers=self.headers)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['items'][0]['bookingCount'],2)
        query=self.cur.execute.call_args.args
        self.assertIn("='CUSTOMER'",query[0]);self.assertIn("ESCAPE '~'",query[0])
        self.assertEqual(query[1],'%QA~%~_%')
        self.assertEqual(query[-3:],('ACTIVE',1,1))
        self.assertNotIn('password',response.get_data(as_text=True).lower())
        self.assertEqual(self.writes(),[])

    def test_empty_search_is_200(self):
        self.cur.fetchone.side_effect=[self.admin,(0,)]
        self.cur.fetchall.return_value=[]
        response=self.client.get('/api/admin/customers?keyword=nothing',headers=self.headers)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['items'],[]);self.assertEqual(response.json['totalPages'],0)

    def test_detail_and_non_customer_missing(self):
        self.cur.fetchone.side_effect=[self.admin,self.customer]
        response=self.client.get('/api/admin/customers/2',headers=self.headers)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['customerId'],2)
        self.assertNotIn('passwordHash',response.json)
        self.cur.fetchone.side_effect=[self.admin,None]
        response=self.client.get('/api/admin/customers/1',headers=self.headers)
        self.assertEqual(response.status_code,404)
        self.assertIn("='CUSTOMER'",self.cur.execute.call_args.args[0])

    def test_history_scoped_read_only_preserves_archived_field_history(self):
        self.cur.fetchone.side_effect=[self.admin,self.customer,(1,)]
        self.cur.fetchall.return_value=[Row(BookingID=10,FieldID=5,FieldName='QA Field',FieldType='7 player',
                                           BookingDate=date(2026,11,1),StartTime='18:00:00',EndTime='19:00:00',TotalAmount=350000,Status='CANCELLED')]
        response=self.client.get('/api/admin/customers/2/bookings',headers=self.headers)
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['items'][0]['bookingId'],10)
        self.assertEqual(self.cur.execute.call_args.args[1:],(2,0,10))
        self.assertNotIn('IsArchived',self.cur.execute.call_args.args[0])
        self.assertEqual(self.writes(),[]);self.conn.commit.assert_not_called()

    def test_empty_history(self):
        self.cur.fetchone.side_effect=[self.admin,self.customer,(0,)]
        self.cur.fetchall.return_value=[]
        response=self.client.get('/api/admin/customers/2/bookings',headers=self.headers)
        self.assertEqual(response.json['items'],[])

    def test_partial_name_update_only_users_contact_column(self):
        changed=Row(**{**vars(self.customer),'FullName':'New Name'})
        self.cur.fetchone.side_effect=[self.admin,self.customer,changed]
        response=self.put({'fullName':'  New Name  '})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['updatedFields'],['fullName'])
        self.assertEqual(response.json['customer']['email'],self.customer.Email)
        writes=self.writes();self.assertEqual(len(writes),1)
        self.assertIn('SET FullName=? WHERE',writes[0][0]);self.assertEqual(writes[0][1:],('New Name',2))
        self.conn.commit.assert_called_once()

    def test_partial_email_is_normalized(self):
        changed=Row(**{**vars(self.customer),'Email':'new@example.invalid'})
        self.cur.fetchone.side_effect=[self.admin,self.customer,None,changed]
        response=self.put({'email':' New@Example.invalid '})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['customer']['email'],'new@example.invalid')
        self.assertEqual(self.writes()[0][1:],('new@example.invalid',2))

    def test_duplicate_email_or_phone_409_no_write(self):
        for value in ({'email':'duplicate@example.invalid'},{'phone':'0900000003'}):
            self.cur.fetchone.side_effect=[self.admin,self.customer,Row(UserID=3)]
            response=self.put(value)
            self.assertEqual(response.status_code,409)
            self.assertEqual(response.json['code'],'CONTACT_ALREADY_USED')
        self.assertEqual(self.writes(),[]);self.conn.commit.assert_not_called()

    def test_noop_returns_200_without_write(self):
        self.cur.fetchone.side_effect=[self.admin,self.customer]
        response=self.put({'fullName':self.customer.FullName})
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.json['updatedFields'],[])
        self.conn.commit.assert_not_called();self.assertEqual(self.writes(),[])

    def test_forbidden_and_unknown_fields(self):
        for key in ('role','status','username','password','passwordHash','userId','bookingId','paidAmount','Phone'):
            response=self.put({key:'malicious'})
            self.assertEqual(response.status_code,400,key)
            self.assertEqual(response.json['code'],'INVALID_FIELDS')
        self.conn.cursor.assert_not_called()

    def test_invalid_body_types(self):
        for payload in ({},[],False,'text',123):self.assertEqual(self.put(payload).status_code,400)
        response=self.client.put('/api/admin/customers/2',data='{bad',content_type='application/json',headers=self.headers)
        self.assertEqual(response.status_code,400);self.conn.cursor.assert_not_called()

    def test_validation_bounds(self):
        for payload in ({'fullName':''},{'fullName':'x'*101},{'fullName':'bad\x00text'},{'fullName':'\ud800'},
                        {'email':'user@'},{'email':'x'*101+'@a.vn'},{'email':False},{'email':'é@example.invalid'},
                        {'phone':'123'},{'phone':'1900000000'},{'phone':123},{'phone':None}):
            self.assertEqual(self.put(payload).status_code,400)
        self.conn.cursor.assert_not_called()

    def test_query_validation_and_ids(self):
        for query in ('status=NO','page=0','page=1.5','pageSize=51','keyword='+'x'*101):
            self.assertEqual(self.client.get('/api/admin/customers?'+query,headers=self.headers).status_code,400)
        for value in (0,2147483648):
            self.assertEqual(self.client.get(f'/api/admin/customers/{value}',headers=self.headers).status_code,400)
            self.assertEqual(self.client.get(f'/api/admin/customers/{value}/bookings',headers=self.headers).status_code,400)
        self.conn.cursor.assert_not_called()

    def test_commit_error_rolls_back_without_success(self):
        self.cur.fetchone.side_effect=[self.admin,self.customer,Row(**{**vars(self.customer),'FullName':'New'})]
        self.conn.commit.side_effect=RuntimeError('QA commit failure')
        with self.assertLogs(app.logger,level='ERROR'):response=self.put({'fullName':'New'})
        self.assertEqual(response.status_code,500);self.conn.rollback.assert_called_once()
        self.assertNotIn('QA commit',response.get_data(as_text=True))

    def test_deadlock_conflict_and_rowcount_conflict(self):
        self.cur.fetchone.side_effect=[self.admin,self.customer]
        def execute(sql,*args):
            if sql.startswith('UPDATE'):raise pyodbc.OperationalError('40001','1205 deadlock victim')
        self.cur.execute.side_effect=execute
        response=self.put({'fullName':'New'})
        self.assertEqual(response.status_code,409)
        self.assertEqual(response.json['code'],'CUSTOMER_CHANGED')

    def test_missing_database_is_503(self):
        with patch('services.customer_service.get_connection',return_value=None):
            self.assertEqual(self.client.get('/api/admin/customers',headers=self.headers).status_code,503)

    def test_rowcount_change_is_conflict(self):
        self.cur.fetchone.side_effect=[self.admin,self.customer]
        self.cur.rowcount=0
        response=self.put({'fullName':'New'})
        self.assertEqual(response.status_code,409)
        self.assertEqual(response.json['code'],'CUSTOMER_CHANGED')
        self.conn.commit.assert_not_called();self.conn.rollback.assert_called_once()

    def test_oversize_request_is_413(self):
        self.assertEqual(self.put({'fullName':'x'*20000}).status_code,413)
        self.conn.cursor.assert_not_called()


if __name__=='__main__':unittest.main()
