// T123-174: fixed Vietnam clock, deliberately stale available=true API fixtures.
// Start Vite on 5188, then run: node tests/past_booking_browser_check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const browser = process.env.FIELD_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const baseUrl = process.env.FIELD_BASE_URL || 'http://127.0.0.1:5188';
const output = 'docs/T123-174-evidence';
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
  const errors = [];
  const held = [];
  let hold = false, availabilityRequests = 0;
  const field = {FieldID:1,FieldName:'QA Field',FieldType:'5',Location:'QA',Status:'AVAILABLE'};
  const response = date => ({Date:date,TotalFields:1,AvailableFields:1,Fields:[{...field,FieldStatus:'AVAILABLE',HasAvailableSlot:true,Slots:[{StartTime:'18:00',EndTime:'19:00',Price:100,available:true}]}]});
  const fulfill = (requestId, body) => send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(body)).toString('base64')});
  socket.onclose = () => { for (const task of pending.values()) task.reject(new Error('Browser connection closed')); };
  socket.onmessage = ({data}) => {
    const message=JSON.parse(data);
    if(message.id){const task=pending.get(message.id);pending.delete(message.id);message.error?task?.reject(new Error(JSON.stringify(message.error))):task?.resolve(message.result);}
    if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.text);
    if(message.method==='Fetch.requestPaused'){
      const {requestId,request}=message.params;const url=new URL(request.url);
      if(url.pathname==='/api/fields/availability'){
        availabilityRequests++;
        if(hold){held.push({requestId,date:url.searchParams.get('date')});return;}
        fulfill(requestId,response(url.searchParams.get('date'))).catch(e=>errors.push(e.message));
      }else {const body=url.pathname==='/api/auth/me'?{user:{UserID:1,Role:'CUSTOMER',Status:'ACTIVE'}}:url.pathname==='/api/fields/1/availability'?{...field,Slots:response(url.searchParams.get('date')).Fields[0].Slots}:url.pathname==='/api/fields/'?[field]:{};fulfill(requestId,body).catch(e=>errors.push(e.message));}
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
  const setDate = value => evaluate(`(() => {const el=document.querySelector('#booking-date');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const RealDate=Date;window.__clock=RealDate.parse('2026-11-15T23:00:00+07:00');window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.__clock]));}static now(){return window.__clock;}};localStorage.setItem('user',JSON.stringify({UserID:1,Role:'CUSTOMER',Status:'ACTIVE'}));localStorage.setItem('accessToken','intercepted-fixture');`});
  await send('Page.navigate',{url:baseUrl+'/fields'});
  await waitFor(`document.querySelector('.field-slot-unavailable')!==null`);
  assert.equal(await evaluate(`document.querySelector('#booking-date').value`),'2026-11-15');
  assert.equal(await evaluate(`document.querySelector('.field-card-booking-button').disabled`),true);
  assert.equal(await evaluate(`document.querySelector('.field-slot-state').textContent`),'\u0110\u00e3 qua gi\u1edd');
  await setDate('2026-11-16');
  await waitFor(`!document.querySelector('.field-card-booking-button').disabled`);
  await evaluate(`window.__clock=Date.parse('2026-11-16T18:00:00+07:00')`);
  await waitFor(`document.querySelector('.field-card-booking-button').disabled`);
  await send('Page.navigate',{url:baseUrl+'/booking?fieldId=1&date=2026-11-15'});
  await waitFor(`document.querySelector('.booking-slot-status')!==null`);
  assert.equal(await evaluate(`document.querySelector('.booking-slot-status').textContent.trim()`),'\u0110\u00e3 qua gi\u1edd');
  assert.equal(await evaluate(`document.querySelector('.booking-slot-status').closest('button').disabled`),true);
  await send('Page.navigate',{url:baseUrl+'/booking?fieldId=1&date=2026-11-16'});
  await waitFor(`document.querySelector('.booking-slot-status')!==null`);
  await evaluate(`document.querySelector('.booking-slot-status').closest('button').click()`);
  await waitFor(`document.querySelector('.booking-primary-button')!==null`);
  await evaluate(`window.__clock=Date.parse('2026-11-16T18:00:00+07:00')`);
  await waitFor(`document.querySelector('.booking-primary-button').disabled`);
  assert.deepEqual(errors,[]);
  const result={passed:5,checks:['23:00 today slots locked and labeled past time despite stale available=true API','Tomorrow remains bookable','Open field page locks when start time arrives','Direct booking page disables past slots','Already selected slot locks Continue when its time arrives']};
  await fs.writeFile(`${output}/checks.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {
  socket?.close();
  child.kill();
}
