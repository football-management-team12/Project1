// T123-169: controlled Vietnam/server clock, intercepted APIs, no live data.
// Start Vite on 5188; node tests/booking_default_date_browser_check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const base = process.env.BOOKING_DEFAULT_BASE_URL || 'http://127.0.0.1:5188';
const out = 'docs/T123-169-evidence';
await fs.mkdir(out, { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'booking-default-'));
const child = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(100); }
  }
  assert.ok(port, 'Browser started');
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
  const errors = [], queries = [], held = [];
  let hold = false, fail = false;
  const serverTimeMs = Date.parse('2026-11-16T00:30:00+07:00');
  const fields = [1, 2, 3].map(FieldID => ({ FieldID, FieldName:`QA Field ${FieldID}`, FieldType:'5 player',
    Location:'QA fixture', Status:FieldID === 2 ? 'MAINTENANCE' : 'AVAILABLE' }));
  const fieldAvailability = (field, date) => ({ ...field, Date:date, FieldStatus:field.Status,
    HasAvailableSlot:field.FieldID === 1,
    Slots:[{ PriceID:field.FieldID, StartTime:'18:00', EndTime:'19:00', Price:100000,
      available:field.FieldID === 1, reason:field.FieldID === 3 ? 'BOOKED' : undefined }] });
  const fulfill = (requestId, body, responseCode = 200) => send('Fetch.fulfillRequest', { requestId, responseCode,
    responseHeaders:[{ name:'Content-Type', value:'application/json' }],
    body:Buffer.from(JSON.stringify(body)).toString('base64') });
  socket.onclose = () => { for (const task of pending.values()) task.reject(new Error('Browser closed')); };
  socket.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) { const task = pending.get(m.id); pending.delete(m.id); m.error ? task?.reject(new Error(JSON.stringify(m.error))) : task?.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text);
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      const url = new URL(request.url), date = url.searchParams.get('date');
      if (request.method !== 'GET') { fulfill(requestId, { message:'Writes disabled' }, 405).catch(e=>errors.push(e.message)); return; }
      if (url.pathname === '/api/fields/availability' || /^\/api\/fields\/\d+\/availability$/.test(url.pathname)) {
        queries.push({ path:url.pathname, date });
        const body = url.pathname === '/api/fields/availability'
          ? { Date:date, TotalFields:3, AvailableFields:1, UnavailableFields:2, Fields:fields.map(f=>fieldAvailability(f,date)) }
          : fieldAvailability(fields[0],date);
        if (hold) { held.push({ requestId, body }); return; }
        fulfill(requestId, fail ? { message:'Availability unavailable (fixture)' } : body, fail ? 503 : 200).catch(e=>errors.push(e.message));
      } else {
        const body = url.pathname === '/api/time' ? { serverTimeMs }
          : url.pathname === '/api/auth/me' ? { user:{ UserID:1, FullName:'QA Customer', Role:'CUSTOMER', Status:'ACTIVE' } }
          : url.pathname === '/api/fields/' ? fields : {};
        fulfill(requestId, body).catch(e=>errors.push(e.message));
      }
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns:[{ urlPattern:'*/api/*' }] });
  // Device is on yesterday, browser timezone is UTC; /api/time is Vietnam today.
  await send('Emulation.setTimezoneOverride', { timezoneId:'UTC' });
  await send('Page.addScriptToEvaluateOnNewDocument', { source:`
    const RealDate=Date; const fixed=RealDate.parse('2026-11-15T16:30:00Z');
    window.Date=class extends RealDate { constructor(...args){super(...(args.length?args:[fixed]));} static now(){return fixed;} };
    window.__elapsed=0; const realNow=performance.now.bind(performance);
    performance.now=()=>realNow()+window.__elapsed;
    localStorage.clear();
  ` });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue:true, awaitPromise:true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async expression => {
    for (let i=0;i<120;i++) { if (await evaluate(expression)) return; await pause(100); }
    throw new Error(`Timed out: ${expression}`);
  };
  const setDate = value => evaluate(`(()=>{const el=document.querySelector('#booking-date');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});
    el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const currentDate = () => evaluate(`document.querySelector('#booking-date')?.value`);
  const enabled = `document.querySelector('.field-card-booking-button')?.disabled===false`;
  const results = [];
  const screenshot = async name => {
    await evaluate('document.fonts.ready.then(()=>true)');
    const shot = await send('Page.captureScreenshot', { format:'png', captureBeyondViewport:true });
    await fs.writeFile(`${out}/${name}.png`, Buffer.from(shot.data, 'base64'));
  };

  await send('Emulation.setDeviceMetricsOverride', { width:1440, height:1000, deviceScaleFactor:1, mobile:false });
  await send('Page.navigate', { url:base+'/fields' });
  await waitFor(`document.querySelector('#booking-date')?.value==='2026-11-16' && ${enabled}`);
  assert.ok(queries.some(q=>q.path==='/api/fields/availability' && q.date==='2026-11-16'));
  assert.equal(await evaluate(`document.querySelectorAll('.field-card-booking-button')[1].disabled`),true);
  assert.equal(await evaluate(`document.querySelectorAll('.field-card-booking-button')[2].disabled`),true);
  await screenshot('desktop-default-date');
  results.push('Server-synchronized Vietnam today shown and requested automatically; only free fields bookable');

  await evaluate('window.__elapsed+=86400000');
  await waitFor(`document.querySelector('#booking-date')?.value==='2026-11-17' && ${enabled}`);
  assert.ok(queries.some(q=>q.date==='2026-11-17'));
  results.push('Untouched default date follows Vietnam midnight and reloads availability');

  await setDate('2026-11-20');
  await waitFor(enabled);
  await evaluate('window.__elapsed+=86400000');
  await pause(1200);
  assert.equal(await currentDate(),'2026-11-20');
  results.push('Manually selected date preserved across clock/day changes');

  hold=true;
  await setDate('2026-11-21');
  await waitFor(`document.querySelector('.field-card-booking-button')?.disabled===true`);
  for(let i=0;i<100 && !held.length;i++)await pause(50);
  assert.ok(held.length);
  hold=false;
  for(const response of held.splice(0))await fulfill(response.requestId,response.body);
  await waitFor(enabled);
  results.push('Date change disables booking until matching availability arrives');

  await evaluate(`document.querySelector('.field-card-booking-button').click()`);
  await waitFor(`location.pathname==='/login'`);
  const redirect = await evaluate(`new URLSearchParams(location.search).get('redirect')`);
  assert.equal(redirect,'/booking?fieldId=1&date=2026-11-21');
  results.push('Guest login redirect retains exact field/date');

  await evaluate(`localStorage.setItem('user',JSON.stringify({UserID:1,Role:'CUSTOMER',Status:'ACTIVE'}));localStorage.setItem('accessToken','intercepted-fixture')`);
  // Add synthetic auth after the common clock/storage initialization on reload.
  const authSetup=await send('Page.addScriptToEvaluateOnNewDocument', { source:`localStorage.setItem('user',JSON.stringify({UserID:1,Role:'CUSTOMER',Status:'ACTIVE'}));localStorage.setItem('accessToken','intercepted-fixture');` });
  await send('Page.navigate', { url:base+'/booking?fieldId=1' });
  await waitFor(`document.querySelector('#booking-date')?.value==='2026-11-16' && !!document.querySelector('.booking-slot-status')`);
  assert.ok(queries.some(q=>q.path==='/api/fields/1/availability' && q.date==='2026-11-16'));
  results.push('Authenticated direct Booking link without date defaults to server today and loads slots');

  await setDate('2026-11-20');
  await waitFor(`new URLSearchParams(location.search).get('date')==='2026-11-20'`);
  await evaluate('window.__elapsed+=86400000');
  await pause(1200);
  assert.equal(await currentDate(),'2026-11-20');
  await setDate('');
  await waitFor(`document.querySelector('#booking-date')?.value==='2026-11-17'`);
  results.push('Booking explicit date preserved; clearing date returns to current Vietnam day');

  await send('Emulation.setDeviceMetricsOverride', { width:375, height:900, deviceScaleFactor:1, mobile:true });
  await send('Page.navigate', { url:base+'/fields' });
  await waitFor(`document.querySelector('#booking-date')?.value==='2026-11-16' && ${enabled}`);
  await screenshot('mobile-default-date');
  await evaluate(`document.querySelector('.field-card-booking-button').click()`);
  await waitFor(`location.pathname==='/booking' && document.querySelector('#booking-date')?.value==='2026-11-16'`);
  assert.equal(await evaluate(`new URLSearchParams(location.search).get('fieldId')`),'1');
  results.push('Mobile default date and authenticated Book button navigate with current field/date');

  fail=true;
  await send('Page.navigate', { url:base+'/fields' });
  await waitFor(`!!document.querySelector('.field-card-error')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('.field-card-booking-button')].every(b=>b.disabled)`),true);
  results.push('Availability failure never enables booking');
  await send('Page.removeScriptToEvaluateOnNewDocument', { identifier:authSetup.identifier });
  assert.deepEqual(errors,[]);
  await fs.writeFile(`${out}/checks.json`,JSON.stringify({ browser:'Edge headless', timezone:'UTC',
    deviceClock:'2026-11-15T16:30:00Z',serverClock:'2026-11-16T00:30:00+07:00',
    transport:'Intercepted GET fixtures only; no real user, database or booking writes',passed:results.length,results,queries },null,2)+'\n');
  console.log(`PASS: ${results.length} date/booking browser scenarios`);
} finally {
  socket?.close();
  child.kill();
}
