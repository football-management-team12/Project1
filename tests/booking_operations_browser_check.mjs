// T123-170: cancellation decisions with synthetic intercepted APIs.
// Start Vite on 5188, then run: node tests/cancellation_result_browser_check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const browser = process.env.REGISTER_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const baseUrl = process.env.REGISTER_BASE_URL || 'http://127.0.0.1:5189';
const output = 'docs/T123-170-admin-evidence';
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
  let bookingDate='2026-11-16';
  let attendance=null;
  let operationEvents=[];
  let storedStatus='CONFIRMED';
  const errors=[];
  const booking=()=>({BookingID:10,UserID:1,FieldID:1,FieldName:'QA Field',FieldType:'5',Location:'QA',BookingDate:bookingDate,StartTime:'18:00',EndTime:'19:00',TotalAmount:100,PaidAmount:30,TotalPaidAmount:totalPaid,Status:storedStatus,AttendanceState:attendance,PaymentStatus:'SUCCESS',CancellationRequest:{status,reviewNote:note,reviewedAt:status==='PENDING_REVIEW'?null:'2026-11-15 23:00:00'}});
  socket.onclose=()=>{for(const task of pending.values())task.reject(new Error('Browser closed'));};
  socket.onmessage=({data})=>{
    const message=JSON.parse(data);
    if(message.id){const task=pending.get(message.id);pending.delete(message.id);message.error?task?.reject(new Error(JSON.stringify(message.error))):task?.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
    if(message.method==='Fetch.requestPaused'){
      const {requestId,request}=message.params;const url=new URL(request.url);let body={};calls++;
      if(url.pathname==='/api/time')body={serverTimeMs:Date.parse('2026-11-16T18:30:00+07:00')};
      else if(url.pathname==='/api/bookings/10/operations')body={events:operationEvents};
      else if(url.pathname==='/api/bookings/10/settlement')body={bookingStatus:storedStatus,totalAmount:100,depositAmount:30,paidAmount:30,remainingAmount:70,status:'PARTIALLY_PAID',canConfirm:bookingDate<='2026-11-16'&&storedStatus==='CONFIRMED',confirmAvailableAt:bookingDate+'T18:00:00+07:00'};
      else if(url.pathname.includes('/operations/')){
        const action=url.pathname.split('/').at(-1);
        if(action==='check-in')attendance='CHECKED_IN';
        if(action==='no-show'){attendance='NO_SHOW';storedStatus='CANCELLED';}
        if(action==='restore-cancellation'){attendance='CANCELLATION_RESTORED';storedStatus='CONFIRMED';}
        operationEvents.push({eventId:operationEvents.length+1,type:attendance,actor:'QA Owner',at:'2026-11-16T11:30:00Z',reason:JSON.parse(request.postData||'{}').reason||''});
        body={message:'Updated'};
      }
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const RealDate=Date;window.Date=class extends RealDate {constructor(...args){super(...(args.length?args:['2026-11-16T18:30:00+07:00']));}static now(){return RealDate.parse('2000-01-01T00:00:00Z');}};window.confirm=()=>true;localStorage.setItem('user',JSON.stringify({UserID:1,Role:'ADMIN',Status:'ACTIVE',FullName:'QA'}));localStorage.setItem('accessToken','intercepted-only');const original=setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>original(fn,ms===10000?150:ms,...args);`});
  const navigate=()=>send('Page.navigate',{url:baseUrl+'/admin/bookings'});
  const open=async()=>{await waitFor(`document.querySelector('.booking-action-detail')!==null`);await evaluate(`document.querySelector('.booking-action-detail').click()`);await waitFor(`document.querySelector('.booking-operations-panel')!==null`);};
  const reason=()=>evaluate(`(()=>{const el=document.querySelector('.booking-operations-panel textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'QA correction reason');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  bookingDate='2026-11-17';
  await navigate();await open();
  await waitFor(`document.querySelector('.settlement-numbers')!==null`);
  assert.equal(await evaluate(`document.querySelector('.settlement-confirm')`),null,'Collection hidden before start');
  bookingDate='2026-11-16';
  await navigate();
  await waitFor(`document.querySelector('tbody .booking-status-progress')!==null`);
  await open();
  await waitFor(`document.querySelector('.settlement-confirm')!==null`);
  assert.equal(await evaluate(`document.querySelector('.booking-action-cancel')`),null,'No cancellation during play');
  assert.equal(await evaluate(`document.querySelector('.booking-action-complete')`),null,'No manual finish action');
  assert.equal(await evaluate(`document.querySelectorAll('.booking-operation-actions button').length`),2,'No check-in action');
  assert.equal(await evaluate(`document.querySelector('.booking-operation-actions button').disabled`),true,'No-show blocked before end');
  bookingDate='2026-11-15';
  await navigate();await open();
  assert.equal(await evaluate(`document.querySelector('.booking-operation-actions button').disabled`),false,'No-show available after end despite wrong device clock');
  await evaluate(`document.querySelector('.booking-operation-actions button').click()`);
  await pause(100);
  assert.equal(attendance,null,'Reason required');
  await reason();await evaluate(`document.querySelector('.booking-operation-actions button').click()`);
  await waitFor(`document.querySelectorAll('.booking-operation-history article').length===1`);
  assert.equal(attendance,'NO_SHOW');
  assert.equal(await evaluate(`document.querySelectorAll('.booking-row-unpaid').length`),0);
  assert.equal(await evaluate(`document.querySelector('.booking-operation-actions button').disabled`),true,'Expired booking cannot restore');
  assert.deepEqual(errors,[]);
  console.log('PASS: automatic playing status, no check-in, no-show after end requires reason, retained deposit and history');

} finally {
  if(socket?.readyState===WebSocket.OPEN){
    socket.send(JSON.stringify({id:99999999,method:'Browser.close'}));
    await pause(300);
  }
  socket?.close();
  child.kill();
  child.unref();
}
