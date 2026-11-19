// T123-89: real browser layout checks; no backend or real credentials required.
// Start Vite on port 5178, then run: node tests/navbar_browser_check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const browser = process.env.NAVBAR_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const baseUrl = process.env.NAVBAR_BASE_URL || 'http://127.0.0.1:5178';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'navbar-browser-'));
const output = 'docs/T123-89-evidence';
await fs.mkdir(output, { recursive: true });
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
  assert.ok(port, 'Browser must start');
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
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id); pending.delete(message.id);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error))); else task?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Fetch.requestPaused') {
      send('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 404,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from('{}').toString('base64') }).catch(error => errors.push(error.message));
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  const results = [];
  let initialization;
  for (const name of ['guest', 'customer', 'long-name']) {
    if (initialization) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initialization });
    const user = name === 'guest' ? null : { UserID: 1, Role: 'CUSTOMER',
      FullName: name === 'customer' ? 'Nguyen Van A' : 'TenKhachHangRatDai'.repeat(10) };
    const setup = await send('Page.addScriptToEvaluateOnNewDocument', { source:
      `localStorage.clear(); ${user ? `localStorage.setItem('user', ${JSON.stringify(JSON.stringify(user))});` : ''}` });
    initialization = setup.identifier;
    for (const width of [320, 375, 390, 576, 768, 769, 820, 1024, 1100, 1200, 1280, 1440]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
      await send('Page.navigate', { url: `${baseUrl}/login` });
      let metrics;
      for (let i = 0; i < 100; i++) {
        const value = await send('Runtime.evaluate', { expression: `JSON.stringify((() => {
          const navbar = document.querySelector('.navbar');
          const brand = document.querySelector('.navbar-brand');
          const auth = document.querySelector(${JSON.stringify(user ? '.navbar-user-area' : '.navbar-auth')});
          if (!navbar || !brand || !auth || document.readyState !== 'complete'
              || getComputedStyle(brand).fontWeight !== '700') return null;
          const b = brand.getBoundingClientRect(), a = auth.getBoundingClientRect();
          const controls = [...auth.querySelectorAll('a,button')].map(el => {
            const r = el.getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width};
          });
          return {viewport:innerWidth,brandRight:b.right,authLeft:a.left,authRight:a.right,
            navbarOverflow:navbar.scrollWidth>innerWidth,controls,
            menuVisible:getComputedStyle(document.querySelector('.navbar-menu')).display!=='none'};
        })())`, returnByValue: true });
        metrics = JSON.parse(value.result.value || 'null');
        if (metrics) break;
        await pause(100);
      }
      const label = `${name} ${width}px`;
      assert.ok(metrics, `Navbar rendered: ${label}`);
      assert.ok(metrics.brandRight + 1 <= metrics.authLeft, `Brand/auth must not overlap: ${label} ${JSON.stringify(metrics)}`);
      assert.ok(metrics.authRight <= width, `Auth must fit viewport: ${label}`);
      assert.equal(metrics.navbarOverflow, false, `No navbar overflow: ${label}`);
      assert.ok(metrics.controls.every(c => c.width > 0 && c.left >= 0 && c.right <= width), `Controls visible: ${label}`);
      assert.equal(metrics.menuVisible, true, `Navigation remains accessible: ${label}`);
      results.push({ name, width, result: 'PASS', ...metrics });
      if ((name === 'guest' && width === 375) || (name === 'long-name' && width === 820)) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        await fs.writeFile(`${output}/${name}-${width}.png`, Buffer.from(shot.data, 'base64'));
      }
    }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/checks.json`, JSON.stringify({ browser: 'Edge headless',
    transport: 'All API requests intercepted; synthetic user storage', cases: results }, null, 2) + '\n');
  console.log(`PASS: ${results.length} navbar layout checks`);
} finally {
  socket?.close();
  child.kill();
}
