// T123-170: cancellation decisions with synthetic intercepted APIs.
// Start Vite on 5188, then run: node tests/cancellation_result_browser_check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const browser = process.env.REGISTER_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const baseUrl = process.env.REGISTER_BASE_URL || 'http://127.0.0.1:5189';
const output = 'docs/T123-170-notification-evidence';
await fs.mkdir(output, { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'register-check-'));
const child = spawn(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(100); }
  }
  assert.ok(port, 'Edge must start');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  let status='REJECTED';
  let note='QA rejected reason';
  let calls=0;
  let totalPaid=30;
  let pendingCancellation=true;
  const errors=[];
  const booking=()=>({BookingID:10,UserID:1,FieldID:1,FieldName:'QA Field',FieldType:'5',Location:'QA',BookingDate:'2099-01-01',StartTime:'18:00',EndTime:'19:00',TotalAmount:100,PaidAmount:30,TotalPaidAmount:totalPaid,Status:status==='APPROVED'?'CANCELLED':'CONFIRMED',PaymentStatus:'SUCCESS',CancellationRequest:{status,reviewNote:note,reviewedAt:status==='PENDING_REVIEW'?null:'2026-11-15 23:00:00'}});
  socket.onclose=()=>{for(const task of pending.values())task.reject(new Error('Browser closed'));};
  socket.onmessage=({data})=>{
    const message=JSON.parse(data);
    if(message.id){const task=pending.get(message.id);pending.delete(message.id);message.error?task?.reject(new Error(JSON.stringify(message.error))):task?.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
    if(message.method==='Fetch.requestPaused'){
      const {requestId,request}=message.params;const url=new URL(request.url);let body={};calls++;
      if(url.pathname==='/api/admin/cancellation-requests')body={requests:pendingCancellation?[{requestId:7,bookingId:10,status:'PENDING_REVIEW',bookingStatus:'CONFIRMED',customerName:'QA',reason:'QA cancellation',depositPaid:30}]:[]};
      else if(url.pathname==='/api/auth/me')body={user:{UserID:1,Role:'ADMIN',Status:'ACTIVE',FullName:'QA'}};
      else if(url.pathname==='/api/bookings/')body={Bookings:[booking()],Total:1};
      else if(url.pathname==='/api/bookings/10')body=booking();
      else if(url.pathname.endsWith('/cancellation'))body={canCancel:true,depositPaid:30,refundStatus:status==='APPROVED'?'PENDING_REFUND':'NOT_REQUIRED',latestRequest:{...booking().CancellationRequest,reason:'QA cancellation'},message:'QA rules'};
      else if(url.pathname.endsWith('/deposit'))body={currentPaymentStatus:'SUCCESS',depositAmount:30,booking:{status:booking().Status},requiresDeposit:false};
      send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')}).catch(e=>{if(!e.message.includes('Invalid InterceptionId'))errors.push(e.message);});
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error(`Timed out: ${expression}`);
  }
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('user',JSON.stringify({UserID:1,Role:'ADMIN',Status:'ACTIVE',FullName:'QA'}));localStorage.setItem('accessToken','intercepted-only');const original=setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>original(fn,ms===10000?150:ms,...args);`});
  await send('Page.navigate',{url:baseUrl+'/admin/bookings'});
  await waitFor(`document.querySelector('.admin-cancellation-notification')!==null`);
  assert.equal(await evaluate(`document.querySelector('.admin-cancellation-notification span').textContent`),'1');
  await evaluate(`document.querySelector('.admin-cancellation-notification').click()`);
  await waitFor(`location.hash==='#cancellation-requests'`);
  assert.equal(await evaluate(`document.querySelectorAll('.cancellation-request-card').length`),1);
  pendingCancellation=false;
  await waitFor(`document.querySelector('.admin-cancellation-notification')===null`);
  await waitFor(`document.querySelector('.cancellation-requests-empty')!==null`);
  pendingCancellation=true;
  await waitFor(`document.querySelector('.admin-cancellation-notification')!==null`);
  assert.deepEqual(errors,[]);
  console.log('PASS: cancellation bell count, click navigation, automatic clear and new request notification');
} finally {
  if(socket?.readyState===WebSocket.OPEN){
    socket.send(JSON.stringify({id:99999999,method:'Browser.close'}));
    await pause(300);
  }
  socket?.close();
  child.kill();
  child.unref();
}
