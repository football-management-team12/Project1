// Full routes + real React forms, with intercepted APIs only. No SQL writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const base=process.env.UC10_BASE_URL || 'http://127.0.0.1:5173';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'uc10-browser-'));
const child=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],
  {windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const output='docs/uc10-evidence';await fs.mkdir(output,{recursive:true});
let socket;
try {
  let port;
  for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await pause(100);}}
  assert.ok(port,'Edge starts');
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0,saved=null,mode='normal',attempts=0,publicAuth=false;
  const pending=new Map(),errors=[],checks=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  const user={UserID:1,Username:'qa-reviewer',FullName:'QA Reviewer',Role:'CUSTOMER',Status:'ACTIVE'};
  const booking=(n,status)=>({BookingID:n,UserID:1,CustomerName:'QA Reviewer',FieldID:5,FieldName:'QA Field',FieldType:'7 player',Location:'QA',
    BookingDate:'2026-11-01',StartTime:'18:00',EndTime:'19:00',TotalAmount:600000,PaidAmount:200000,RemainingAmount:400000,Status:status,PaymentStatus:'PARTIALLY_PAID'});
  socket.onmessage=({data})=>{
    const m=JSON.parse(data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(new Error(JSON.stringify(m.error))):p?.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if(m.method==='Fetch.requestPaused'){
      const {requestId,request}=m.params;const url=new URL(request.url),p=url.pathname;let body={},status=200;
      if(p==='/api/auth/me')body={user};
      else if(p==='/api/customer-bookings/me')body={Bookings:[booking(10,'COMPLETED'),booking(11,'PENDING')]};
      else if(p.startsWith('/api/customer-bookings/me/'))body=booking(Number(p.split('/').at(-1)),p.endsWith('/11')?'PENDING':'COMPLETED');
      else if(p.endsWith('/settlement'))body={bookingId:10,bookingStatus:'COMPLETED',totalAmount:600000,depositAmount:200000,paidAmount:200000,remainingAmount:400000,status:'PARTIALLY_PAID',canConfirm:false};
      else if(p.endsWith('/cancellation'))body={canCancel:false,latestRequest:null,depositPaid:200000};
      else if(p.includes('/bookings/')&&p.endsWith('/reviews')){
        if(request.method==='POST'){
          attempts++;const input=JSON.parse(request.postData);
          if(mode==='fail') {status=500;body={code:'REVIEW_ERROR',message:'Không thể gửi đánh giá thử nghiệm'};mode='normal';}
          else {
            saved={reviewId:30,bookingId:10,fieldId:5,rating:input.rating,comment:input.comment,createdAt:'2026-11-10T04:00:00Z'};
            if(mode==='duplicate'){status=409;body={code:'REVIEW_ALREADY_EXISTS',message:'Đơn này đã được đánh giá'};}
            else {status=201;body=saved;}
          }
        }else body={bookingId:10,fieldId:5,canReview:!saved&&mode!=='ineligible',review:saved,reason:saved?'REVIEW_ALREADY_EXISTS':null};
      }else if(p.includes('/fields/')&&p.endsWith('/reviews')){
        publicAuth ||= Object.keys(request.headers).some(k=>k.toLowerCase()==='authorization');
        if(mode==='list-error'){status=503;body={message:'Chức năng đánh giá chưa sẵn sàng'};}
        else {
          const page=Number(url.searchParams.get('page')||1),empty=p.includes('/6/');
          body={fieldId:empty?6:5,fieldName:empty?'QA Empty Field':'QA Field',page,pageSize:10,total:empty?0:11,totalPages:empty?0:2,averageRating:empty?null:4.5,
            items:empty?[]:[{reviewId:page,fieldId:5,rating:5,comment:page===1?'Đánh giá trang đầu':'Đánh giá trang sau',createdAt:'2026-11-10T04:00:00Z',reviewerName:'Khách đã đặt sân'}]};
        }
      }
      send('Fetch.fulfillRequest',{requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')})
        .catch(e=>{if(!e.message.includes('Invalid InterceptionId'))errors.push(e.message);});
    }
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(location.pathname.startsWith('/bookings')){localStorage.setItem('user',${JSON.stringify(JSON.stringify(user))});localStorage.setItem('accessToken','test-only-intercepted');}else{localStorage.removeItem('user');localStorage.removeItem('accessToken');}`});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async expression=>{for(let i=0;i<120;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw new Error('Timeout '+expression+' '+JSON.stringify(errors));};
  const navigate=async pathname=>{await send('Page.navigate',{url:base+pathname});};
  const shot=async name=>{const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(`${output}/${name}.png`,Buffer.from(result.data,'base64'));};
  const fill=async text=>{await evaluate(`(()=>{document.querySelector('#booking-review-panel input[value="5"]').click();const el=document.querySelector('#booking-review-panel textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('/bookings');
  await wait('document.body.textContent.includes("QA Field")');
  assert.equal(await evaluate('[...document.querySelectorAll("button")].filter(b=>b.textContent.trim()==="Đánh giá sân").length'),1);
  checks.push('History: review action only for COMPLETED');
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Đánh giá sân").click()');
  await wait('document.querySelector("#booking-review-panel textarea")');
  assert.equal(await evaluate('document.querySelector("#booking-review-panel button[type=submit]").disabled'),true);
  const text='<img src=x onerror="window.uc10Xss=1"> Sân tốt, đúng giờ';
  await fill(text);
  await evaluate('document.querySelector("#booking-review-panel").scrollIntoView({block:"start",behavior:"instant"})');
  await shot('form-desktop');
  await evaluate('document.querySelector("#booking-review-panel form").requestSubmit()');
  await wait('document.querySelector("#booking-review-panel")?.textContent.includes("gửi thành công")');
  assert.equal(attempts,1);assert.equal(await evaluate('document.querySelector("#booking-review-panel form")'),null);
  assert.equal(await evaluate('document.querySelector("#booking-review-panel img")'),null);
  assert.equal(await evaluate('window.uc10Xss || false'),false);
  checks.push('Submit: rating/comment, success, prevent repeat and safe text rendering');
  await evaluate('document.querySelector("#booking-review-panel").scrollIntoView({block:"start",behavior:"instant"})');
  await shot('submitted-desktop');
  await navigate('/bookings/10');await wait('document.querySelector(".uc10-saved")');
  assert.equal(await evaluate('document.querySelector("#booking-review-panel form")'),null);checks.push('Reload: saved review persists, no new form');
  saved=null;mode='duplicate';await navigate('/bookings/10');await wait('document.querySelector("#booking-review-panel textarea")');
  await fill('Concurrent tab fixture');await evaluate('document.querySelector("#booking-review-panel form").requestSubmit()');
  await wait('document.querySelector(".uc10-saved")');checks.push('Duplicate 409: load existing review and remove form');
  saved=null;mode='fail';await navigate('/bookings/10');await wait('document.querySelector("#booking-review-panel textarea")');
  await fill('Retry fixture');await evaluate('document.querySelector("#booking-review-panel form").requestSubmit()');
  await wait('document.querySelector("#booking-review-panel [role=alert]")');
  assert.equal(await evaluate('document.querySelector("#booking-review-panel textarea").value'),'Retry fixture');
  await wait('!document.querySelector("#booking-review-panel button[type=submit]").disabled');
  await evaluate('document.querySelector("#booking-review-panel form").requestSubmit()');await wait('document.querySelector(".uc10-saved")');checks.push('Server error: preserve input, retry succeeds');
  saved=null;mode='ineligible';await navigate('/bookings/10');await wait('document.querySelector("#booking-review-panel")?.textContent.includes("Chỉ đơn đã hoàn thành")');
  assert.equal(await evaluate('document.querySelector("#booking-review-panel form")'),null);checks.push('Stale/ineligible booking: no submit form');
  mode='normal';await navigate('/fields/5/reviews');await wait('document.body.textContent.includes("Đánh giá trang đầu")');
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Trang sau").click()');
  await wait('document.body.textContent.includes("Đánh giá trang sau")');checks.push('Public field reviews: pagination switches page');
  assert.equal(publicAuth,false);
  await send('Emulation.setDeviceMetricsOverride',{width:375,height:900,deviceScaleFactor:1,mobile:true});
  await shot('public-mobile');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);checks.push('Mobile: no horizontal overflow');
  await navigate('/fields/6/reviews');await wait('document.body.textContent.includes("Chưa có đánh giá")');checks.push('Empty field: empty state, no fabricated rating');
  mode='list-error';await navigate('/fields/5/reviews');await wait('document.querySelector("[role=alert]")');
  mode='normal';
  await evaluate('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Thử lại").click()');
  await wait('document.body.textContent.includes("Đánh giá trang đầu")');checks.push('Public API unavailable: error/retry recovery');
  saved=null;await navigate('/bookings/10#booking-review-panel');await wait('document.querySelector("#booking-review-panel textarea")');
  await fill('Nhận xét thử nghiệm trên điện thoại');
  await evaluate('document.querySelector("#booking-review-panel").scrollIntoView({block:"start",behavior:"instant"})');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true);
  await shot('form-mobile');checks.push('Mobile form: rating/comment visible without horizontal overflow');
  assert.deepEqual(errors,[]);
  const result={passed:checks.length,scenarios:checks,note:'Intercepted API fixtures, no SQL or live customer writes.'};
  await fs.writeFile(`${output}/browser-checks.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{socket?.close();child.kill();}
