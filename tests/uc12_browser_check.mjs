// UC12 UI contract checks. Every /api request is intercepted; no live data writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const base = process.env.UC12_BASE_URL || 'http://127.0.0.1:5178';
const browser = process.env.UC12_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'uc12-browser-'));
const output = 'docs/uc12-evidence';
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
  assert.ok(port, 'Browser starts');
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  const errors = [], requests = [], results = [];
  let scenario = 'list', role = 'ADMIN', cancelled = false, paid = false;
  const invoice = () => ({ invoiceId: 20, bookingId: 10, bookingStatus: scenario === 'settlement' ? 'COMPLETED' : 'CANCELLED',
    invoiceStatus: cancelled ? 'CANCELLED' : 'ACTIVE', paymentStatus: paid ? 'PAID' : scenario === 'settlement' ? 'PARTIALLY_PAID' : 'UNPAID',
    status: cancelled ? 'CANCELLED' : paid ? 'PAID' : 'UNPAID',
    totalAmount: 100000, depositAmount: scenario === 'settlement' ? 30000 : 0, paidAmount: paid ? 100000 : scenario === 'settlement' ? 30000 : 0,
    remainingAmount: paid ? 0 : scenario === 'settlement' ? 70000 : 100000,
    customer: { userId: 1, name: 'Khách hàng kiểm thử', email: 'qa@example.test' },
    field: { name: 'Sân đã archive', location: 'Test' }, createdDate: '2026-11-09T10:00:00',
    bookingDate: '2026-11-09', startTime: '18:00', endTime: '19:00', canCancel: !cancelled && scenario !== 'settlement',
    allowedTransitions: !cancelled && scenario !== 'settlement' ? ['CANCELLED'] : [],
    cancellation: cancelled ? { by: 2, at: '2026-11-09T11:00:00', reason: 'QA hủy hóa đơn' } : null,
    payments: [{ paymentId: 5, type: 'DEPOSIT', amount: 30000, status: 'FAILED', method: 'BANK_TRANSFER', reference: 'QA-5', recordedAt: '2026-11-09T09:00:00' }], refund: null });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id; pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  socket.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) {
      const task = pending.get(msg.id); pending.delete(msg.id);
      if (msg.error) task?.reject(new Error(JSON.stringify(msg.error))); else task?.resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
    if (msg.method === 'Fetch.requestPaused') {
      const { requestId, request } = msg.params;
      const url = new URL(request.url);
      requests.push({ method: request.method, path: url.pathname, search: url.search, body: request.postData });
      let body, status = 200;
      if (url.pathname === '/api/auth/me') body = { user: { UserID: 2, Role: role, FullName: 'QA Admin' } };
      else if (url.pathname === '/api/admin/invoices') {
        if (scenario === 'error') { status = 500; body = { message: 'Không thể tải hóa đơn' }; }
        else body = { items: scenario === 'empty' ? [] : [invoice()], page: Number(url.searchParams.get('page') || 1), pageSize: 20, hasNext: url.searchParams.get('page') !== '2' };
      } else if (url.pathname === '/api/admin/invoices/20/status' && request.method === 'PATCH') {
        assert.equal(JSON.parse(request.postData).status, 'CANCELLED');
        cancelled = true; body = { message: 'Đã hủy hóa đơn', invoiceStatus: 'CANCELLED' };
      } else if (url.pathname === '/api/admin/invoices/20') body = invoice();
      else if (url.pathname === '/api/bookings/10/settlement') body = { ...invoice(), canConfirm: !paid };
      else if (url.pathname === '/api/admin/bookings/10/confirm-final-payment' && request.method === 'POST') {
        paid = true; body = { message: 'Đã xác nhận', status: 'PAID' };
      } else { status = 404; body = { message: 'No fixture' }; }
      send('Fetch.fulfillRequest', { requestId, responseCode: status,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') })
        .catch(error => {
          // React StrictMode cleanup and navigation abort requests already intercepted.
          if (!error.message.includes('Invalid InterceptionId')) errors.push(error.message);
        });
    }
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/api/*' }] });
  let init;
  async function navigate(url, nextScenario = 'list', width = 1366, nextRole = 'ADMIN') {
    scenario = nextScenario; role = nextRole; cancelled = false; paid = false;
    if (init) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: init });
    const setup = await send('Page.addScriptToEvaluateOnNewDocument', { source:
      `localStorage.setItem('user', ${JSON.stringify(JSON.stringify({ UserID: 2, Role: role, FullName: 'QA Admin' }))}); localStorage.setItem('accessToken', 'fake-intercepted-only'); window.confirm = () => true;` });
    init = setup.identifier;
    await send('Emulation.setDeviceMetricsOverride', { width, height: 950, deviceScaleFactor: 1, mobile: width < 600 });
    await send('Page.navigate', { url: base + url });
  }
  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  }
  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100); }
    throw new Error('Timed out: ' + expression + '\n' + await evaluate('document.body.innerText'));
  }
  const clickText = text => evaluate(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes(${JSON.stringify(text)}))?.click()`);
  const screenshot = async name => {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    await fs.writeFile(`${output}/${name}.png`, Buffer.from(shot.data, 'base64'));
  };
  await navigate('/admin/invoices');
  await waitFor(`document.querySelector('.uc12-table tbody tr')`);
  assert.match(await evaluate('document.body.innerText'), /qa@example.test/);
  await screenshot('list-desktop');
  results.push('ADMIN issued invoice list');
  await evaluate(`(() => { const input=document.querySelector('[name=customer]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'QA'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await clickText('Tìm kiếm');
  await waitFor(`document.querySelector('.uc12-table tbody tr')`);
  assert.ok(requests.some(r => r.search.includes('customer=QA')));
  results.push('Customer filter sent to API');
  await clickText('Trang sau');
  await waitFor(`document.querySelector('caption')?.textContent.includes('Trang 2')`);
  results.push('Next page uses server pagination');
  await navigate('/admin/invoices', 'empty');
  await waitFor(`document.body.innerText.includes('Không tìm thấy hóa đơn phù hợp')`);
  results.push('Empty result');
  await navigate('/admin/invoices', 'error');
  await waitFor(`document.querySelector('[role=alert]')`);
  scenario = 'list'; await clickText('Thử lại');
  await waitFor(`document.querySelector('.uc12-table tbody tr')`);
  results.push('API failure and retry');
  await navigate('/admin/invoice-management/20', 'detail');
  await waitFor(`document.body.innerText.includes('QA-5')`);
  await screenshot('detail-desktop');
  await evaluate(`(() => { const input=document.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(input,'QA hủy hóa đơn'); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await clickText('Hủy hóa đơn');
  await waitFor(`document.body.innerText.includes('bởi tài khoản #2')`);
  assert.equal(requests.filter(r => r.method === 'PATCH').length, 1);
  assert.equal(await evaluate(`!!document.querySelector('textarea')`), false);
  results.push('Cancellation confirmation, reason, refresh and terminal action hidden');
  await navigate('/admin/invoice-management/20', 'settlement');
  await waitFor(`document.querySelector('.settlement-panel') && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Xác nhận')&&!b.disabled)`);
  await clickText('Xác nhận');
  await waitFor(`!document.querySelector('.settlement-panel') && document.body.innerText.includes('Đã thanh toán đủ')`);
  assert.ok(requests.some(r => r.method === 'POST' && r.path.endsWith('/confirm-final-payment')));
  results.push('UC09 settlement reused and invoice refreshed after payment');
  await navigate('/admin/invoices', 'list', 390);
  await waitFor(`document.querySelector('.uc12-table tbody tr')`);
  await screenshot('list-mobile');
  const overflow = await evaluate(`({viewport:innerWidth,width:document.documentElement.scrollWidth})`);
  assert.ok(overflow.width <= overflow.viewport + 2, JSON.stringify(overflow));
  results.push('Mobile table scroll stays inside viewport');
  const before = requests.length;
  await navigate('/admin/invoices', 'list', 1366, 'CUSTOMER');
  await waitFor(`!location.pathname.startsWith('/admin')`);
  assert.ok(!requests.slice(before).some(r => r.path === '/api/admin/invoices'));
  results.push('CUSTOMER denied Admin page before invoice API');
  assert.deepEqual(errors, []);
  await fs.writeFile(`${output}/checks.json`, JSON.stringify({ results, errors, note: 'Synthetic intercepted APIs; no SQL writes or real credentials.' }, null, 2) + '\n');
  console.log(JSON.stringify({ passed: results.length, results }));
} finally {
  socket?.close(); child.kill();
}
