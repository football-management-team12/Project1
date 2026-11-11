// T123-168: isolated Edge UI regression checks; every API call is intercepted.
// Start Vite on 5188, then run: node tests/register_validation_browser_check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const browser = process.env.REGISTER_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const baseUrl = process.env.REGISTER_BASE_URL || 'http://127.0.0.1:5188';
const output = 'docs/T123-168-evidence';
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
  let apiStatus = 409;
  let requests = 0;
  const errors = [];
  socket.onclose = () => { for (const task of pending.values()) task.reject(new Error('Browser connection closed')); };
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id); pending.delete(message.id);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error))); else task?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const registration = new URL(request.url).pathname === '/api/auth/register' && request.method === 'POST';
      if (registration) requests++;
      const body = registration ? { success: apiStatus === 201,
        message: apiStatus === 201 ? 'Registration successful' : 'Email already used (test fixture)' } : {};
      send('Fetch.fulfillRequest', { requestId, responseCode: registration ? apiStatus : 404,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(body)).toString('base64') }).catch(error => errors.push(error.message));
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
  const setValue = async (name, value) => {
    await evaluate(`(() => { const el=document.querySelector('[name=${name}]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});
      el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  };
  const submit = () => evaluate(`document.querySelector('.register-submit-button').click()`);
  const shot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await fs.writeFile(`${output}/${name}.png`, Buffer.from(r.data, 'base64'));
  };
  const results = [];
  for (const width of [375, 768, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: width < 600 });
    await send('Page.navigate', { url: `${baseUrl}/register` });
    await waitFor(`!!document.querySelector('.register-card') && document.readyState==='complete'`);
    await evaluate(`document.fonts.ready.then(()=>true)`);
    const initial = await evaluate(`(() => { const p=document.querySelector('[name=password]');
      const hint=document.querySelector('#register-password-hint');
      return {type:p.type,placeholder:p.placeholder,toggleCount:document.querySelectorAll('.register-password-toggle svg').length,
        hintWidth:hint.getBoundingClientRect().width,overflow:document.documentElement.scrollWidth>innerWidth,
        nativeRevealSuppressed:[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.selectorText?.includes('::-ms-reveal')&&r.style.display==='none')}catch{return false}})}; })()`);
    assert.equal(initial.type, 'password');
    assert.equal(initial.toggleCount, 1);
    assert.ok(initial.placeholder.includes('8+'));
    assert.equal(initial.hintWidth, 1);
    assert.equal(initial.nativeRevealSuppressed, true);
    assert.equal(initial.overflow, false);
    await submit();
    await waitFor(`document.querySelectorAll('.register-card .form-error').length===5`);
    const redErrors = await evaluate(`[...document.querySelectorAll('.register-card .form-error')].every(el=>
      getComputedStyle(el).color==='rgb(185, 28, 28)' && el.getAttribute('role')==='alert')`);
    assert.equal(redErrors, true);
    assert.equal(requests, results.length * 2, 'Invalid form must not call API');
    if (width === 375) await shot('mobile-errors');
    for (const [name, value] of Object.entries({fullName:'UI Test',username:'ui_test',email:'ui_test@example.com',phone:'0912345678'}))
      await setValue(name, value);
    await evaluate(`document.querySelector('[name=password]').focus()`);
    await send('Input.insertText', { text: 'Abcdefg1' });
    await waitFor(`document.querySelector('[name=password]').value.length===8`);
    if (width === 375) await shot('mobile-password-focused');
    await evaluate(`document.querySelector('.register-password-toggle').click()`);
    assert.equal(await evaluate(`document.querySelector('[name=password]').type`), 'text');
    assert.equal(await evaluate(`document.querySelector('.register-password-toggle').getAttribute('aria-pressed')`), 'true');
    await evaluate(`document.querySelector('.register-password-toggle').click()`);
    assert.equal(await evaluate(`document.querySelector('[name=password]').type`), 'password');
    assert.equal(await evaluate(`document.querySelector('[name=password]').value.length`), 8);
    await setValue('password', '12345678');
    await submit();
    await waitFor(`!!document.querySelector('#register-password-error')`);
    assert.equal(requests, results.length * 2, 'Weak password must not call API');
    await setValue('password', 'Abcdefg1');
    apiStatus = 409;
    await submit();
    await waitFor(`!!document.querySelector('.register-card .server-message')`);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.register-card .server-message')).color`), 'rgb(185, 28, 28)');
    assert.equal(await evaluate(`document.querySelector('.register-card .server-message').innerText`), 'Email already used (test fixture)');
    if (width === 1440) await shot('desktop-server-error');
    apiStatus = 201;
    await submit();
    await waitFor(`location.pathname==='/login'`);
    results.push({ width, result:'PASS', checks:['red field/server errors','placeholder policy','one custom reveal icon',
      'native Edge reveal suppressed','toggle preserves value','weak password rejected','server error displayed','successful registration redirect','no horizontal overflow'] });
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/checks.json`, JSON.stringify({ browser:'Edge headless',
    transport:'All API calls intercepted; synthetic registration data', requests, results }, null, 2)+'\n');
  console.log(`PASS: ${results.length} viewports, ${results.length * 9} UI checks; ${requests} intercepted registration requests`);
} finally {
  socket?.close();
  child.kill();
}
