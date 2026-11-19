// T123-73: controlled slow availability responses; no live API writes.
// Start Vite on 5188, then run: node tests/field_availability_browser_check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const browser = process.env.FIELD_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const baseUrl = process.env.FIELD_BASE_URL || 'http://127.0.0.1:5188';
const output = 'docs/T123-73-evidence';
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
      }else fulfill(requestId,url.pathname==='/api/fields/'?[field]:{}).catch(e=>errors.push(e.message));
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
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const original=window.setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>original(fn,ms===30000?150:ms,...args);const interval=window.setInterval.bind(window);window.setInterval=(fn,ms,...args)=>interval(fn,ms===30000?150:ms,...args);`});
  await send('Page.navigate',{url:baseUrl+'/fields'});
  await waitFor(`document.querySelector('.field-card')!==null`);
  const today = await evaluate(`(() => {const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');})()`);
  assert.equal(await evaluate(`document.querySelector('#booking-date').value`),today);
  await waitFor(`document.querySelector('.field-slot-available')!==null`);
  assert.ok(availabilityRequests>0);
  assert.equal(await evaluate(`document.querySelector('.field-card-booking-button').disabled`),false);
  await setDate('2099-01-01');
  await waitFor(`document.querySelector('.field-slot-available')!==null`);
  hold=true;
  await pause(220);
  const first=availabilityRequests;
  await pause(500);
  assert.equal(availabilityRequests,first,'Slow refresh must not overlap another request');
  await setDate('2099-01-02');
  await waitFor(`document.querySelector('.field-card-booking-button').disabled`);
  await pause(100);
  const newer=held.find(x=>x.date==='2099-01-02');assert.ok(newer);
  await fulfill(newer.requestId,response(newer.date));
  await waitFor(`!document.querySelector('.field-card-booking-button').disabled`);
  await fulfill(held[0].requestId,{...response('2099-01-01'),AvailableFields:0,Fields:[]});
  await pause(50);
  assert.equal(await evaluate(`document.querySelector('.field-card-booking-button').disabled`),false,'Old date response must not replace new date');
  hold=false;
  await evaluate(`document.querySelector('.field-filter-reset').click()`);
  await waitFor(`document.querySelector('#booking-date').value===${JSON.stringify(today)}`);
  await waitFor(`document.querySelector('.field-slot-available')!==null`);
  assert.equal(await evaluate(`document.querySelector('.field-card-booking-button').disabled`),false);
  assert.deepEqual(errors,[]);
  const result={passed:5,checks:['Today selected and availability loaded on entry','No overlapping slow refresh requests','Date switch disables stale booking','Late old-date response ignored','Reset restores today and loads availability']};
  await fs.writeFile(`${output}/checks.json`,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
} finally {
  socket?.close();
  child.kill();
}
