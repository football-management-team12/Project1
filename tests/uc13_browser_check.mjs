// Full UC13 React routes with intercepted synthetic APIs; no live SQL writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const base=process.env.UC13_BASE_URL||'http://127.0.0.1:5173';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'uc13-browser-'));
const child=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));const out='docs/uc13-evidence';await fs.mkdir(out,{recursive:true});let socket;
try {
  let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await pause(100);}}
  assert.ok(port);
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  const pending=new Map(),errors=[],checks=[];let id=0,mode='normal',lastPut=null,puts=0;
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  const customers=Array.from({length:12},(_,i)=>({customerId:i+2,username:`qa_customer_${i+2}`,fullName:i===0?'QA Alice':i===1?'QA Bob':`QA Customer ${i+2}`,
    email:i===0?'alice@example.invalid':i===1?'bob@example.invalid':`qa-${i+2}@example.invalid`,phone:'09000000'+String(i+2).padStart(2,'0'),
    role:'CUSTOMER',status:i===1||i===2?'INACTIVE':'ACTIVE',bookingCount:i===0?2:0}));
  const history=[{bookingId:10,fieldId:5,fieldName:'QA Field',fieldType:'7 player',bookingDate:'2026-11-01',startTime:'18:00',endTime:'19:00',totalAmount:350000,status:'COMPLETED'},
    {bookingId:11,fieldId:6,fieldName:'QA Archived Field',fieldType:'5 player',bookingDate:'2026-11-02',startTime:'18:00',endTime:'19:00',totalAmount:300000,status:'CANCELLED'}];
  socket.onmessage=({data})=>{
    const m=JSON.parse(data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(new Error(JSON.stringify(m.error))):p?.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Fetch.requestPaused'){
      const {requestId,request}=m.params;const u=new URL(request.url),p=u.pathname;let body={},status=200;
      if(p==='/api/auth/me')body={user:{UserID:1,Role:'ADMIN',FullName:'QA Admin',Status:'ACTIVE'}};
      else if(p==='/api/admin/reviews')body={items:[],total:0,unansweredCount:0};
      else if(p==='/api/admin/customers'){
        if(mode==='list-error'){status=503;body={message:'Không thể tải khách hàng thử nghiệm'};}
        else{
          const keyword=(u.searchParams.get('keyword')||'').toLowerCase(),state=u.searchParams.get('status')||'',page=Number(u.searchParams.get('page')||1),size=10;
          const filtered=customers.filter(c=>(!state||c.status===state)&&[c.fullName,c.username,c.email,c.phone].some(v=>v.toLowerCase().includes(keyword))).sort((a,b)=>b.customerId-a.customerId);
          body={items:filtered.slice((page-1)*size,page*size),total:filtered.length,page,pageSize:size,totalPages:Math.ceil(filtered.length/size)};
        }
      }else if(p.endsWith('/bookings')&&p.startsWith('/api/admin/customers/')){
        if(mode==='history-error'){status=500;body={message:'Không thể tải lịch sử thử nghiệm'};}
        else{const cid=Number(p.split('/').at(-2));body={customerId:cid,items:cid===2?history:[],total:cid===2?2:0,page:1,pageSize:10,totalPages:cid===2?1:0};}
      }else if(p.startsWith('/api/admin/customers/')){
        const c=customers.find(c=>c.customerId===Number(p.split('/').at(-1)));
        if(request.method==='PUT'){
          puts++;lastPut=JSON.parse(request.postData);
          if(lastPut.email==='bob@example.invalid'){status=409;body={code:'CONTACT_ALREADY_USED',message:'Email hoặc số điện thoại đã được sử dụng'};}
          else{Object.assign(c,lastPut);body={message:'Đã cập nhật thông tin khách hàng',customer:c,updatedFields:Object.keys(lastPut)};}
        }else body=c;
      }
      send('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')})
        .catch(e=>{if(!e.message.includes('Invalid InterceptionId'))errors.push(e.message);});
    }
  };
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('user',JSON.stringify({UserID:1,Role:'ADMIN',FullName:'QA Admin'}));localStorage.setItem('accessToken','test-only-intercepted');`});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async expression=>{for(let i=0;i<120;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw new Error('Timeout '+expression+' '+JSON.stringify(errors));};
  const fill=async (selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const click=async text=>evaluate(`[...document.querySelectorAll('.uc13-page button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile(`${out}/${name}.png`,Buffer.from(r.data,'base64'));};
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/admin/customers'});await wait('document.querySelectorAll(".uc13-table tbody tr").length===10');
  assert.equal(await evaluate('document.querySelector(".sidebar").textContent.includes("Quản lý khách hàng")'),true);checks.push('Admin menu/list with CUSTOMER rows and pagination');
  await shot('customer-list');
  await fill('.uc13-filters input','QA Alice');await evaluate('document.querySelector(".uc13-filters").requestSubmit()');
  await wait('document.querySelectorAll(".uc13-table tbody tr").length===1 && document.querySelector(".uc13-table").textContent.includes("QA Alice")');checks.push('Search by contact text');
  await fill('.uc13-filters input','not found');await evaluate('document.querySelector(".uc13-filters").requestSubmit()');
  await wait('document.querySelector(".uc13-page")?.textContent.includes("Không tìm thấy khách hàng")');checks.push('Empty search');
  await click('Xóa bộ lọc');await wait('document.querySelectorAll(".uc13-table tbody tr").length===10');
  await evaluate('(()=>{const el=document.querySelector(".uc13-filters select");el.value="INACTIVE";el.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await evaluate('document.querySelector(".uc13-filters").requestSubmit()');await wait('document.querySelectorAll(".uc13-table tbody tr").length===2');checks.push('Inactive status filter');
  await click('Xóa bộ lọc');await wait('document.querySelectorAll(".uc13-table tbody tr").length===10');await click('Trang sau');
  await wait('document.querySelectorAll(".uc13-table tbody tr").length===2 && document.querySelector(".uc13-pagination").textContent.includes("2/2")');checks.push('List page navigation');
  await evaluate('[...document.querySelectorAll(".uc13-table tbody tr")].find(tr=>tr.textContent.includes("QA Alice")).querySelector("a").click()');
  await wait('document.querySelector("#customer-fullName") && document.querySelectorAll(".uc13-table tbody tr").length===2');
  assert.equal(await evaluate('document.querySelector("#customer-fullName").readOnly'),true);checks.push('Customer detail and scoped booking history, including archived field');
  await shot('customer-detail');await click('Chỉnh sửa');await fill('#customer-fullName','QA Alice Updated');
  await evaluate('document.querySelector(".uc13-contact-form").requestSubmit()');await wait('document.querySelector(".uc13-success")');
  assert.deepEqual(lastPut,{fullName:'QA Alice Updated'});
  assert.equal(await evaluate('document.querySelectorAll(".uc13-table tbody tr").length'),2);checks.push('Partial contact save; history remains visible and unchanged');
  await click('Chỉnh sửa');await fill('#customer-email','bob@example.invalid');await evaluate('document.querySelector(".uc13-contact-form").requestSubmit()');
  await wait('document.querySelector(".uc13-error")?.textContent.includes("đã được sử dụng")');
  assert.equal(await evaluate('document.querySelector("#customer-email").value'),'bob@example.invalid');
  await fill('#customer-email','new-alice@example.invalid');await evaluate('document.querySelector(".uc13-contact-form").requestSubmit()');
  await wait('document.querySelector(".uc13-success") && document.querySelector("#customer-email").readOnly');checks.push('Duplicate conflict preserves draft; corrected email succeeds');
  const countBefore=puts;await click('Chỉnh sửa');await fill('#customer-phone','0910000002');await click('Hủy chỉnh sửa');
  assert.equal(puts,countBefore);assert.equal(await evaluate('document.querySelector("#customer-phone").value'),'0900000002');checks.push('Cancel editing restores contact values without request');
  await send('Page.navigate',{url:base+'/admin/customers/3'});await wait('document.querySelector(".uc13-page")?.textContent.includes("Khách hàng chưa có đơn")');checks.push('Customer with no bookings');
  mode='history-error';await send('Page.navigate',{url:base+'/admin/customers/2'});await wait('document.querySelector(".uc13-error")?.textContent.includes("lịch sử")');
  mode='normal';await click('Làm mới lịch sử');await wait('document.querySelectorAll(".uc13-table tbody tr").length===2');checks.push('Booking history error and retry');
  mode='list-error';await send('Page.navigate',{url:base+'/admin/customers'});await wait('document.querySelector(".uc13-error")');
  mode='normal';await click('Thử lại');await wait('document.querySelectorAll(".uc13-table tbody tr").length===10');checks.push('List error and retry');
  assert.deepEqual(errors,[]);
  const result={passed:checks.length,scenarios:checks,note:'Intercepted APIs, synthetic fixture data, no live writes.'};
  await fs.writeFile(`${out}/browser-checks.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{socket?.close();child.kill();}
