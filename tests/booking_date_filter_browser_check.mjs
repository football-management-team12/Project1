// T123-177: real React routes, intercepted fixtures only; no database mutations.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const base = process.env.BOOKING_FILTER_BASE_URL || "http://127.0.0.1:5188";
const out = "docs/T123-177-evidence";
await fs.mkdir(out, { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "booking-date-"));
const child = spawn(
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  [
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { windowsHide: true, stdio: "ignore" },
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  let port;
  for (let i = 0; i < 100; i++) {
    try {
      port = Number(
        (
          await fs.readFile(path.join(profile, "DevToolsActivePort"), "utf8")
        ).split("\n")[0],
      );
      break;
    } catch {
      await pause(100);
    }
  }
  const target = (
    await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  ).find((item) => item.type === "page");
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => {
    socket.onopen = resolve;
  });
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      pending.set(requestId, { resolve, reject });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
  const fixture = (id, date, status, extra = {}) => ({
    BookingID: id,
    UserID: 2,
    FieldID: 1,
    BookingDate: date,
    StartTime: "12:00",
    EndTime: "14:00",
    Status: status,
    FieldName: `Sân ${id}`,
    CustomerName: `QA ${id}`,
    Phone: "0900000000",
    CreatedAt: "2025-01-01",
    TotalAmount: 500000,
    PaidAmount: 100000,
    TotalPaidAmount: 100000,
    ...extra,
  });
  const rows = [
    fixture(101, "2026-11-16", "PENDING"),
    fixture(102, "2026-11-16", "CONFIRMED"),
    fixture(103, "2026-11-16", "CONFIRMED", {
      StartTime: "09:00",
      EndTime: "11:00",
    }),
    fixture(104, "2026-11-16", "CONFIRMED", {
      StartTime: "06:00",
      EndTime: "08:00",
    }),
    fixture(105, "2026-11-16", "CANCELLED", { AttendanceState: "NO_SHOW" }),
    fixture(106, "2026-11-16", "CANCELLED"),
    fixture(107, "2026-11-16", "COMPLETED", { TotalPaidAmount: 500000 }),
    fixture(108, "2026-11-16", "COMPLETED"),
    fixture(201, "2026-11-17", "CONFIRMED"),
    fixture(202, "2026-11-17", "CANCELLED"),
    fixture(301, "2026-11-18", "CONFIRMED"),
    fixture(401, "2026-11-19", "CONFIRMED"),
    fixture(501, "2026-11-20", "CONFIRMED"),
    fixture(601, "2026-11-15", "COMPLETED"),
    fixture(701, "2026-11-21", "CONFIRMED"),
  ];
  let role = "ADMIN";
  let serverTime = "2026-11-16T10:00:00+07:00";
  let fail = false;
  let delayFrom = "";
  const calls = [];
  const errors = [];
  const checks = [];
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const task = pending.get(message.id);
      pending.delete(message.id);
      message.error
        ? task?.reject(new Error(JSON.stringify(message.error)))
        : task?.resolve(message.result);
    }
    if (message.method === "Runtime.exceptionThrown")
      errors.push(message.params.exceptionDetails.text);
    if (message.method !== "Fetch.requestPaused") return;
    const { requestId, request } = message.params;
    const url = new URL(request.url);
    calls.push({
      role,
      path: url.pathname,
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
    });
    let body = {};
    let code = 200;
    if (url.pathname === "/api/time")
      body = { serverTimeMs: Date.parse(serverTime) };
    else if (url.pathname === "/api/auth/me")
      body = {
        user: { UserID: 1, Role: role, FullName: "QA Admin", Status: "ACTIVE" },
      };
    else if (url.pathname === "/api/bookings/") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (fail) {
        code = 503;
        body = { message: "Lỗi tải đơn thử nghiệm" };
      } else
        body = {
          Bookings: rows.filter(
            (row) =>
              (!from || row.BookingDate >= from) &&
              (!to || row.BookingDate <= to),
          ),
        };
    } else if (/^\/api\/bookings\/\d+$/.test(url.pathname))
      body = rows.find(
        (row) => row.BookingID === Number(url.pathname.split("/").at(-1)),
      );
    else if (url.pathname.endsWith("/confirm-final-payment")) {
      rows.find(row => row.BookingID === 103).TotalPaidAmount = 500000;
      body = { status: "PAID" };
    }
    else if (url.pathname.endsWith("/settlement"))
      body = {
        status: rows.find(row => row.BookingID === 103).TotalPaidAmount === 500000 ? "PAID" : "PARTIALLY_PAID",
        totalAmount: 500000,
        paidAmount: rows.find(row => row.BookingID === 103).TotalPaidAmount,
        remainingAmount: 500000 - rows.find(row => row.BookingID === 103).TotalPaidAmount,
        canConfirm: role === "ADMIN" && rows.find(row => row.BookingID === 103).TotalPaidAmount < 500000,
      };
    else if (url.pathname.endsWith("/cancellation"))
      body = { canCancel: false, depositPaid: 100000 };
    else if (url.pathname.endsWith("/operations")) body = { events: [] };
    else if (url.pathname === "/api/admin/cancellation-requests")
      body = {
        requests: [
          {
            requestId: 1,
            bookingId: 701,
            status: "PENDING_REVIEW",
            bookingStatus: "CONFIRMED",
            customerName: "Ngoài phạm vi ngày",
            reason: "QA",
            depositPaid: 100000,
          },
        ],
      };
    else if (url.pathname === "/api/admin/reviews")
      body = { items: [], unansweredCount: 0 };
    const respond = () =>
      send("Fetch.fulfillRequest", {
        requestId,
        responseCode: code,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(JSON.stringify(body)).toString("base64"),
      }).catch(() => {});
    if (
      url.pathname === "/api/bookings/" &&
      url.searchParams.get("from") === delayFrom
    )
      setTimeout(respond, 1200);
    else respond();
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }] });
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "localStorage.setItem('user',JSON.stringify({UserID:1,Role:'ADMIN',Status:'ACTIVE',FullName:'QA'}));localStorage.setItem('accessToken','fixture-only');const original=setTimeout.bind(window);window.setTimeout=(fn,ms,...args)=>original(fn,ms===10000?350:ms,...args);window.alert=()=>{window.alertCount=(window.alertCount||0)+1;};",
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result.exceptionDetails)
      throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(expression)) return;
      await pause(100);
    }
    throw new Error(`Timeout: ${expression}`);
  };
  const fill = async (selector, value, kind = "input") =>
    evaluate(
      `(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${kind === "select" ? "HTMLSelectElement" : "HTMLInputElement"}.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('${kind === "select" ? "change" : "input"}',{bubbles:true}));})()`,
    );
  const stats = () =>
    evaluate(
      "[...document.querySelectorAll('.booking-lifecycle-stats .card h2')].map(el=>el.textContent)",
    );
  const day = 'input[aria-label="Ngày đặt sân"]';
  const mode = 'select[aria-label="Chọn kiểu lọc ngày"]';
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send("Page.navigate", { url: base + "/admin/bookings" });
  await wait(
    "document.querySelector('.booking-lifecycle-stats h2')?.textContent==='8'",
  );
  assert.deepEqual(await stats(), ["8", "1", "1", "1", "2", "1", "1", "1"]);
  assert.equal(
    await evaluate(`document.querySelector('${day}').value`),
    "2026-11-16",
  );
  assert.ok(
    calls
      .filter((call) => call.path === "/api/bookings/")
      .every((call) => call.from === "2026-11-16" && call.to === "2026-11-16"),
  );
  checks.push(
    "Default Vietnam day, BookingDate not CreatedAt, eight lifecycle KPIs agree with daily rows",
  );
  await fill('select[aria-label="Lọc trạng thái"]', "CANCELLED", "select");
  await wait(
    "document.querySelectorAll('.booking-table-box tbody tr').length===1",
  );
  assert.deepEqual(await stats(), ["8", "1", "1", "1", "2", "1", "1", "1"]);
  await fill('input[aria-label="Tìm booking"]', "no match");
  await wait("document.querySelector('.booking-empty-cell')!==null");
  assert.equal((await stats())[0], "8");
  await fill('input[aria-label="Tìm booking"]', "");
  await fill(day, "2026-11-17");
  await wait(
    "document.querySelector('.booking-lifecycle-stats h2')?.textContent==='2'",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.booking-table-box tbody').textContent.includes('#202')",
    ),
  );
  checks.push(
    "Search/status AND date filter only table; KPIs depend on date alone",
  );
  await fill('select[aria-label="Lọc trạng thái"]', "", "select");
  await fill(mode, "range", "select");
  await fill('input[aria-label="Từ ngày"]', "2026-11-16");
  await fill('input[aria-label="Đến ngày"]', "2026-11-20");
  await wait(
    "document.querySelector('.booking-lifecycle-stats h2')?.textContent==='13'",
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.booking-table-box tbody tr').length",
    ),
    13,
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('#cancellation-requests .cancellation-request-card').length",
    ),
    1,
  );
  assert.ok(
    await evaluate(
      "document.querySelector('#cancellation-requests').textContent.includes('701')",
    ),
  );
  checks.push(
    "Inclusive range covers both boundaries and cancellation inbox stays independent",
  );
  await evaluate("document.querySelector('.title-row button').click()");
  await pause(800);
  assert.equal((await stats())[0], "13");
  assert.equal(
    await evaluate(
      "document.querySelector('input[aria-label=\"Đến ngày\"]').value",
    ),
    "2026-11-20",
  );
  checks.push(
    "Manual refresh and repeated 10-second polling preserve selected range",
  );
  const before = calls.filter((call) => call.path === "/api/bookings/").length;
  await fill('input[aria-label="Từ ngày"]', "2026-11-21");
  await wait("document.getElementById('booking-date-error')!==null");
  assert.equal((await stats())[0], "13");
  await fill('input[aria-label="Đến ngày"]', "");
  await pause(150);
  assert.ok(
    calls
      .slice(before)
      .filter((call) => call.path === "/api/bookings/")
      .every((call) => call.from <= call.to && call.from && call.to),
  );
  checks.push(
    "Reversed/missing range shows friendly error, preserves valid scope and sends no invalid query",
  );
  await evaluate("document.querySelector('.booking-today-button').click()");
  await wait(
    "document.querySelector('.booking-lifecycle-stats h2')?.textContent==='8'",
  );
  await fill(day, "2026-11-22");
  await wait(
    "document.querySelector('.booking-lifecycle-stats h2')?.textContent==='0'",
  );
  assert.deepEqual(await stats(), Array(8).fill("0"));
  assert.ok(
    await evaluate(
      "document.querySelector('.booking-empty-cell').textContent.includes('Không có đơn đặt sân trong khoảng thời gian đã chọn')",
    ),
  );
  checks.push(
    "Empty future day returns eight zero KPIs and explicit empty state without all-history fallback",
  );
  delayFrom = "2026-11-18";
  await fill(day, "2026-11-18");
  await pause(80);
  await fill(day, "2026-11-19");
  await wait(
    "document.querySelector('.booking-table-box tbody').textContent.includes('#401')",
  );
  await pause(1300);
  assert.ok(
    await evaluate(
      "document.querySelector('.booking-table-box tbody').textContent.includes('#401')",
    ),
  );
  assert.equal(
    await evaluate(`document.querySelector('${day}').value`),
    "2026-11-19",
  );
  checks.push("Delayed old response cannot overwrite newer day during polling");
  fail = true;
  await evaluate("document.querySelector('.title-row button').click()");
  await wait(
    "document.querySelector('.booking-filter-error[role=alert]')!==null",
  );
  await pause(750);
  assert.equal(await evaluate("window.alertCount||0"), 0);
  fail = false;
  await evaluate(
    "document.querySelector('.booking-filter-error button').click()",
  );
  await wait(
    "document.querySelector('.booking-table-box tbody').textContent.includes('#401')",
  );
  checks.push(
    "Polling errors use inline message without repeated alerts; retry retains date",
  );
  await evaluate("document.querySelector('.booking-today-button').click()");
  await wait(
    "document.querySelector('.booking-lifecycle-stats h2')?.textContent==='8'",
  );
  await fs.writeFile(
    `${out}/desktop.png`,
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await fill(mode, "range", "select");
  assert.equal(
    await evaluate(
      "document.querySelector('.booking-date-controls').getBoundingClientRect().right<=innerWidth",
    ),
    true,
  );
  await fs.writeFile(
    `${out}/mobile.png`,
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  checks.push("Responsive date controls fit mobile viewport");
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await fill('input[aria-label="Đến ngày"]', "2026-11-20");
  await wait("document.querySelector('.booking-lifecycle-stats h2')?.textContent==='13'");
  await evaluate("window.confirm=()=>true;[...document.querySelectorAll('.booking-table-box tbody tr')].find(row=>row.querySelector('td').textContent.includes('#103')).querySelector('.booking-action-detail').click()");
  await wait("document.querySelector('.settlement-confirm')!==null");
  await evaluate("document.querySelector('.settlement-confirm').click()");
  await wait("document.querySelector('.settlement-status.is-paid')!==null");
  assert.equal(await evaluate("document.querySelector('input[aria-label=\"Đến ngày\"]').value"), "2026-11-20");
  await pause(500);
  assert.equal((await stats())[0], "13");
  checks.push("Detail and cash collection refresh the current selected range without resetting dates");
  serverTime = "2026-11-16T00:30:00+07:00";
  await send("Page.navigate", { url: base + "/admin/bookings" });
  await wait("document.querySelector('.booking-lifecycle-stats h2')?.textContent==='8'");
  assert.equal(await evaluate(`document.querySelector('${day}').value`), "2026-11-16");
  checks.push("Reload at 00:30 Vietnam defaults to current Vietnam date although UTC is previous day");
  role = "STAFF";
  calls.length = 0;
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "localStorage.setItem('user',JSON.stringify({UserID:1,Role:'STAFF',Status:'ACTIVE',FullName:'QA Staff'}));",
  });
  await send("Page.navigate", { url: base + "/admin/bookings" });
  await wait(
    "document.querySelector('.booking-lifecycle-stats h2')?.textContent==='8'",
  );
  await fill(day, "2026-11-17");
  await wait(
    "document.querySelector('.booking-lifecycle-stats h2')?.textContent==='2'",
  );
  assert.equal(
    calls.some((call) => call.path.startsWith("/api/admin/")),
    false,
  );
  checks.push(
    "STAFF can filter dates and KPIs without ADMIN-only API requests",
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${out}/checks.json`,
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        note: "Intercepted fixture APIs; no production data changes.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ passed: checks.length, checks }));
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ id: 99999999, method: "Browser.close" }));
    await pause(300);
  }
  socket?.close();
  child.kill();
  child.unref();
}
