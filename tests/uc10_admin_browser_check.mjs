// Real admin/customer routes; intercepted APIs, accelerated 30-second polling.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
const base=process.env.UC10_BASE_URL||'http://127.0.0.1:5173';
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'uc10-admin-'));
const child=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let socket;
try {
  let port;for(let i=0;i<100;i++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break;}catch{await pause(100);}}
  assert.ok(port);
  const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let id=0,puts=0;const pending=new Map(),errors=[],checks=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  const stamp='2026-11-11T04:00:00Z';
  const row=n=>({reviewId:n,bookingId:10,fieldId:5,fieldName:'QA Field',customerName:'QA Customer',rating:5,
    comment:n===30?'Sân tốt, mong thêm nước uống':'Đánh giá mới tự cập nhật',createdAt:stamp,reply:null});
  let reviews=[row(30)];
  socket.onmessage=({data})=>{
    const m=JSON.parse(data);
    if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p?.reject(new Error(JSON.stringify(m.error))):p?.resolve(m.result);}
    if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(m.method==='Fetch.requestPaused'){
      const {requestId,request}=m.params;const u=new URL(request.url),p=u.pathname;let body={};
      if(p==='/api/auth/me'){
        const auth=Object.entries(request.headers).find(([key])=>key.toLowerCase()==='authorization')?.[1]||'';
        body={user:{UserID:auth.includes('admin')?3:1,Role:auth.includes('admin')?'ADMIN':'CUSTOMER',FullName:'QA User',Status:'ACTIVE'}};
      }else if(p==='/api/admin/reviews'){
        const status=u.searchParams.get('status'),rating=u.searchParams.get('rating');
        const items=reviews.filter(r=>(status==='unanswered'?!r.reply:status==='answered'?!!r.reply:true)&&(!rating||r.rating===Number(rating)));
        body={items,total:items.length,totalPages:items.length?1:0,page:1,pageSize:10,totalReviews:reviews.length,unansweredCount:reviews.filter(r=>!r.reply).length};
      }else if(p.endsWith('/reply')&&request.method==='PUT'){
        puts++;const review=reviews.find(r=>r.reviewId===Number(p.split('/').at(-2)));
        review.reply={comment:JSON.parse(request.postData).comment,createdAt:stamp,updatedAt:stamp};body={reviewId:review.reviewId,reply:review.reply};
      }else if(p==='/api/fields/5/reviews')body={fieldId:5,fieldName:'QA Field',total:reviews.length,totalPages:1,page:1,pageSize:10,averageRating:5,
        items:reviews.map(r=>({reviewId:r.reviewId,fieldId:5,rating:5,comment:r.comment,reviewerName:'Khách đã đặt sân',createdAt:stamp,reply:r.reply}))};
      else if(p==='/api/customer-bookings/me/10')body={BookingID:10,UserID:1,FieldID:5,FieldName:'QA Field',Status:'COMPLETED',BookingDate:'2026-11-01',StartTime:'18:00',EndTime:'19:00',TotalAmount:600000,PaidAmount:200000};
      else if(p==='/api/bookings/10/reviews')body={bookingId:10,fieldId:5,canReview:false,review:reviews.find(r=>r.reviewId===30),reason:'REVIEW_ALREADY_EXISTS'};
      else if(p.endsWith('/settlement'))body={totalAmount:600000,paidAmount:200000,depositAmount:200000,remainingAmount:400000,status:'PARTIALLY_PAID',canConfirm:false};
      else if(p.endsWith('/cancellation'))body={canCancel:false};
      send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')})
        .catch(e=>{if(!e.message.includes('Invalid InterceptionId'))errors.push(e.message);});
    }
  };
  await send('Page.enable');await send('Runtime.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*/api/*'}]});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`{
    const admin=location.pathname.startsWith('/admin');
    if(admin||location.pathname.startsWith('/bookings')){localStorage.setItem('user',JSON.stringify({UserID:admin?3:1,Role:admin?'ADMIN':'CUSTOMER',FullName:'QA User'}));localStorage.setItem('accessToken',admin?'admin-fixture':'customer-fixture');}
    else{localStorage.removeItem('user');localStorage.removeItem('accessToken');}
    const interval=window.setInterval.bind(window);window.setInterval=(fn,delay,...args)=>interval(fn,delay===30000?500:delay,...args);
  }`});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
  const wait=async expression=>{for(let i=0;i<120;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw new Error('Timeout '+expression+' '+JSON.stringify(errors));};
  const fill=async text=>evaluate(`(()=>{const el=document.querySelector('#reply-30');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/admin/reviews'});await wait('document.querySelector("#reply-30")');
  assert.equal(await evaluate('document.querySelector(".sidebar").textContent.includes("Đánh giá & phản hồi")'),true);
  checks.push('Admin menu/inbox, pending count and review form');
  await fill('Bản nháp cần được giữ');reviews=[row(31),...reviews];
  await wait('document.querySelector("#reply-31")');
  assert.equal(await evaluate('document.querySelector("#reply-30").value'),'Bản nháp cần được giữ');
  await wait('[...document.querySelectorAll(".sidebar span")].some(s=>s.getAttribute("aria-label")==="2 đánh giá chưa phản hồi")');
  checks.push('Polling: new review and sidebar count arrive without reload; draft preserved');
  await fill('Cảm ơn bạn! Chủ sân đã ghi nhận góp ý.');
  await evaluate('document.querySelector("#reply-30").closest("form").requestSubmit()');
  await wait('document.querySelector("#reply-30").closest("article").querySelector(".uc10-owner-reply")');
  await wait('[...document.querySelectorAll(".sidebar span")].some(s=>s.getAttribute("aria-label")==="1 đánh giá chưa phản hồi")');
  checks.push('Reply save: public reply shown, pending badge decreases');
  await fill('Nội dung phản hồi được cập nhật');await evaluate('document.querySelector("#reply-30").closest("form").requestSubmit()');
  await wait('document.querySelector("#reply-30").closest("article").querySelector(".uc10-owner-reply").textContent.includes("được cập nhật")');
  assert.equal(puts,2);checks.push('Edit reply: one reply updated instead of adding duplicates');
  const shot=await send('Page.captureScreenshot',{format:'png'});await fs.writeFile('docs/uc10-evidence/admin-replies-desktop.png',Buffer.from(shot.data,'base64'));
  await evaluate(`(()=>{const el=document.querySelector('.uc10-admin-filters select');el.value='unanswered';el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait('document.querySelector("#reply-31") && !document.querySelector("#reply-30")');checks.push('Unanswered filter hides answered review');
  await send('Page.navigate',{url:base+'/fields/5/reviews'});await wait('document.querySelector(".uc10-owner-reply")?.textContent.includes("được cập nhật")');
  checks.push('Public customer field list includes saved owner reply');
  await send('Page.navigate',{url:base+'/bookings/10#booking-review-panel'});await wait('document.querySelector("#booking-review-panel .uc10-owner-reply")?.textContent.includes("được cập nhật")');
  checks.push('Booking owner sees admin reply alongside their existing review');
  assert.deepEqual(errors,[]);
  const result={passed:checks.length,scenarios:checks,note:'Intercepted APIs, polling accelerated from 30s to 500ms in browser test only. No SQL writes.'};
  await fs.writeFile('docs/uc10-evidence/admin-browser-checks.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{socket?.close();child.kill();}
