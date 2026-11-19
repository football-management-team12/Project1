// T123-170: cancellation decisions with synthetic intercepted APIs.
// Start Vite on 5188, then run: node tests/cancellation_result_browser_check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const browser = process.env.REGISTER_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const baseUrl = process.env.REGISTER_BASE_URL || 'http://127.0.0.1:5189';
const output = 'docs/T123-170-evidence';
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
  let status='PENDING_REVIEW';
  let note='';
  let calls=0;
  let totalPaid=30;
  const errors=[];
  const booking=()=>({BookingID:10,UserID:1,FieldID:1,FieldName:'QA Field',FieldType:'5',Location:'QA',BookingDate:'2099-01-01',StartTime:'18:00',EndTime:'19:00',TotalAmount:100,PaidAmount:30,TotalPaidAmount:totalPaid,Status:status==='APPROVED'?'CANCELLED':'CONFIRMED',PaymentStatus:'SUCCESS',CancellationRequest:{status,reviewNote:note,reviewedAt:status==='PENDING_REVIEW'?null:'2026-11-15 23:00:00'}});
  socket.onclose=()=>{for(const task of pending.values())task.reject(new Error('Browser closed'));};
  socket.onmessage=({data})=>{
    const message=JSON.parse(data);
    if(message.id){const task=pending.get(message.id);pending.delete(message.id);message.error?task?.reject(new Error(JSON.stringify(message.error))):task?.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
    if(message.method==='Fetch.requestPaused'){
      const {requestId,request}=message.params;const url=new URL(request.url);let body={};calls++;
      if(url.pathname==='/api/auth/me')body={user:{UserID:1,Role:'CUSTOMER',Status:'ACTIVE',FullName:'QA'}};
      else if(url.pathname==='/api/customer-bookings/me')body={Bookings:[booking()],Total:1};
      else if(url.pathname==='/api/customer-bookings/me/10')body=booking();
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('user',JSON.stringify({UserID:1,Role:'CUSTOMER',Status:'ACTIVE',FullName:'QA'}));localStorage.setItem('accessToken','intercepted-only');const original=setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>original(fn,ms===10000?150:ms,...args);`});
  await send('Page.navigate',{url:baseUrl+'/bookings'});
  await waitFor(`document.querySelector('.uc07-outcome-pending_review')!==null`);
  status='REJECTED';note='<img src=x onerror=alert(1)> QA rejection';
  await waitFor(`document.querySelector('.uc07-outcome-rejected')!==null`);
  assert.equal(await evaluate(`document.querySelector('.uc07-history-cancel')!==null`),false);
  assert.equal(await evaluate(`document.querySelector('.booking-history-status').textContent.trim()`),'\u0110\u00e3 x\u00e1c nh\u1eadn');
  assert.ok(await evaluate(`document.querySelector('.uc07-outcome-rejected').textContent.includes('QA rejection')`));
  assert.equal(await evaluate(`document.querySelector('.uc07-outcome img')!==null`),false);
  await send('Page.navigate',{url:baseUrl+'/bookings/10'});
  await waitFor(`document.querySelector('.uc07-outcome-rejected')!==null`);
  assert.equal(await evaluate(`document.querySelector('.uc07-panel-cancel')!==null`),false);
  status='APPROVED';note='QA approved';
  await waitFor(`document.querySelector('.uc07-outcome-approved')!==null`);
  assert.equal(await evaluate(`document.querySelector('.uc07-panel-success')!==null`),false,'Approval must not claim refund completed');
  await send('Page.reload');
  await waitFor(`document.querySelector('.uc07-outcome-approved')!==null`);
  await send('Page.navigate',{url:baseUrl+'/bookings'});
  await waitFor(`document.querySelector('.uc07-outcome-approved')!==null`);
  status='REJECTED';totalPaid=100;
  await send('Page.navigate',{url:baseUrl+'/bookings'});
  await waitFor(`document.querySelector('.booking-history-status-confirmed')!==null`);
  assert.ok(await evaluate(`document.querySelector('.booking-payment-badge.is-paid')!==null`));
  assert.ok(await evaluate(`document.querySelector('.uc07-outcome-rejected')!==null`));
  assert.deepEqual(errors,[]);
  const result={passed:6,checks:['Pending request clearly shown in history','History updates automatically to rejected with note','Admin note renders as text, not HTML','Detail updates automatically to approved','Approval does not claim refunded','Result persists after reload and return to history'],requests:calls};
  await fs.writeFile(`${output}/checks.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {
  if(socket?.readyState===WebSocket.OPEN){
    socket.send(JSON.stringify({id:99999999,method:'Browser.close'}));
    await pause(300);
  }
  socket?.close();
  child.kill();
  child.unref();
}
