// Read-only UI checks. API responses are replayed locally; no request reaches SQL.
// Run after npm run dev: node tests/invoice_browser_check.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const evidence = JSON.parse(await fs.readFile('docs/uc08-verification.json', 'utf8'));
const browser = process.env.UC08_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'uc08-browser-'));
const output = 'docs/uc08-evidence';
await fs.mkdir(output, { recursive: true });
const child = spawn(browser, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
const pause = (ms) => new Promise(resolve => setTimeout(resolve, ms));
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = Number((await fs.readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
    catch { await pause(100); }
  }
  if (!port) throw new Error('Browser did not start');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [];
  let scenario;
  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  }
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id); pending.delete(message.id);
      if (message.error) task?.reject(new Error(JSON.stringify(message.error))); else task?.resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      const url = new URL(request.url);
      let status = 200;
      let body;
      if (request.method !== 'GET') { status = 405; body = { message: 'Mutations disabled in UI checks' }; }
      else if (url.pathname === '/api/auth/me') body = { user: { UserID: 1, Role: scenario.role, FullName: 'UC08 Preview' } };
      else if (url.pathname.endsWith('/settlement')) body = scenario.invoice;
      else if (/\/invoice$|\/invoices\/\d+$/.test(url.pathname)) {
        status = scenario.http || 200;
        body = status === 200 ? scenario.invoice : { message: 'Invoice not found', code: 'INVOICE_NOT_FOUND' };
      } else { status = 404; body = { message: 'No fixture for this API' }; }
      send('Fetch.fulfillRequest', { requestId, responseCode: status,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(body)).toString('base64') }).catch(error => errors.push(error.message));
    }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  const partial = evidence.fixtures.find(f => f.response.isProvisional && f.response.bookingStatus !== 'CANCELLED').response;
  const paid = evidence.fixtures.find(f => f.response.paymentStatus === 'PAID').response;
  const unpaid = { ...paid, paymentStatus: 'UNPAID', status: 'UNPAID', depositAmount: 0,
    paidAmount: 0, remainingAmount: paid.totalAmount, paymentMethod: 'NOT_RECORDED' };
  const legacyPaid = { ...paid };
  delete legacyPaid.field;
  delete legacyPaid.paymentStatus;
  const legacyPartial = { ...partial };
  delete legacyPartial.field;
  delete legacyPartial.paymentStatus;
  const cases = [
    { name: 'customer-provisional', role: 'CUSTOMER', invoice: partial, width: 1440, height: 1200, source: 'SQL response replay' },
    { name: 'customer-paid', role: 'CUSTOMER', invoice: paid, width: 1440, height: 1200, source: 'SQL response replay' },
    { name: 'customer-unpaid', role: 'CUSTOMER', invoice: unpaid, width: 1440, height: 1200, source: 'Synthetic fixture; no issued UNPAID invoice in SQL' },
    { name: 'admin-provisional', role: 'ADMIN', invoice: partial, width: 1440, height: 1200, source: 'SQL response replay' },
    { name: 'admin-mobile', role: 'ADMIN', invoice: partial, width: 390, height: 1000, source: 'SQL response replay' },
    { name: 'customer-mobile', role: 'CUSTOMER', invoice: partial, width: 390, height: 1000, source: 'SQL response replay' },
    { name: 'customer-not-found', role: 'CUSTOMER', invoice: partial, http: 404, width: 1440, height: 1000, source: 'Synthetic 404' },
    { name: 'customer-legacy-paid', role: 'CUSTOMER', invoice: legacyPaid, width: 1440, height: 1200, source: 'Legacy API response without field/paymentStatus' },
    { name: 'customer-legacy-provisional', role: 'CUSTOMER', invoice: legacyPartial, width: 390, height: 1000, source: 'Legacy API response without field/paymentStatus' },
    { name: 'admin-legacy-paid', role: 'ADMIN', invoice: legacyPaid, width: 1440, height: 1200, source: 'Legacy API response without field/paymentStatus' },
    { name: 'customer-missing-field', role: 'CUSTOMER', invoice: { ...paid, field: null, fieldId: null, fieldName: null, fieldType: null, location: null }, width: 390, height: 1000, source: 'Synthetic response with unavailable field metadata' },
  ];
  const results = [];
  let initialization;
  for (const item of cases) {
    scenario = item;
    if (initialization) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: initialization });
    const setup = await send('Page.addScriptToEvaluateOnNewDocument', { source:
      `localStorage.setItem('user', JSON.stringify({UserID:1,Role:${JSON.stringify(item.role)},FullName:'UC08 Preview'})); localStorage.setItem('accessToken','ui-fixture-token-not-a-real-jwt');` });
    initialization = setup.identifier;
    await send('Emulation.setDeviceMetricsOverride', { width: item.width, height: item.height, deviceScaleFactor: 1, mobile: item.width < 500 });
    // ADMIN opens the old shared URL: assert it redirects into AdminLayout.
    await send('Page.navigate', { url: `http://localhost:5173/bookings/${item.invoice.bookingId}/invoice` });
    let rendered;
    for (let i = 0; i < 100; i++) {
      const value = await send('Runtime.evaluate', { expression: `JSON.stringify({ready:!!document.querySelector(${JSON.stringify(item.http ? '[role="alert"]' : '.invoice-card')}),text:document.querySelector('.invoice-page')?.innerText||'',admin:!!document.querySelector('.admin-container'),navbar:!!document.querySelector('.navbar'),overflow:document.documentElement.scrollWidth>innerWidth,url:location.pathname})`, returnByValue: true });
      if (value.result.value) rendered = JSON.parse(value.result.value);
      if (rendered?.ready) break;
      await pause(100);
    }
    if (!rendered?.ready) throw new Error(`UI did not render: ${item.name}`);
    if (rendered.overflow) throw new Error(`Horizontal overflow: ${item.name}`);
    if ((item.role === 'ADMIN') !== rendered.admin) throw new Error(`Wrong layout: ${item.name}`);
    if (item.role === 'ADMIN' && (!rendered.url.startsWith('/admin/') || rendered.navbar)) throw new Error('Admin escaped layout');
    if (!item.http) {
      const amount = new Intl.NumberFormat('vi-VN').format(item.invoice.remainingAmount);
      if (!rendered.text.includes(amount)) throw new Error(`Missing remaining balance: ${item.name}`);
      const expectedStatus = item.invoice.paymentStatus ?? item.invoice.status;
      const label = { UNPAID: '\u0043h\u01b0a thanh to\u00e1n', PARTIALLY_PAID: '\u0110\u00e3 thanh to\u00e1n m\u1ed9t ph\u1ea7n', PAID: '\u0110\u00e3 thanh to\u00e1n \u0111\u1ee7' }[expectedStatus];
      if (label && !rendered.text.includes(label)) throw new Error(`Missing payment status: ${item.name}`);
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await fs.writeFile(`${output}/${item.name}.png`, Buffer.from(shot.data, 'base64'));
    results.push({ name: item.name, source: item.source, result: 'PASS', url: rendered.url, overflow: rendered.overflow });
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
  await fs.writeFile(`${output}/ui-checks.json`, JSON.stringify({ transport: 'Intercepted GET responses; no mutations', cases: results }, null, 2) + '\n');
  console.log(`PASS: ${results.length} UI checks; screenshots in ${output}`);
} finally {
  socket?.close();
  child.kill();
}
