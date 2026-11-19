// Real routes and React UI, intercepted fixture APIs only. No application writes.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const base = process.env.DASHBOARD_BASE_URL || "http://127.0.0.1:5188";
const out = "docs/T123-176-evidence";
await fs.mkdir(out, { recursive: true });
const profile = await fs.mkdtemp(path.join(os.tmpdir(), "dashboard-check-"));
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
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  socket = new WebSocket(
    targets.find((item) => item.type === "page").webSocketDebuggerUrl,
  );
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
  let role = "ADMIN";
  let mode = "normal";
  const calls = [];
  const errors = [];
  const checks = [];
  const booking = {
    BookingID: 10,
    UserID: 2,
    FieldID: 1,
    BookingDate: "2026-11-16",
    StartTime: "09:00",
    EndTime: "11:00",
    Status: "CONFIRMED",
    FieldName: "Sân A1",
    CustomerName: "Khách thử nghiệm",
    Phone: "0900000000",
    TotalAmount: 500000,
    PaidAmount: 100000,
    TotalPaidAmount: 100000,
  };
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
      query: url.search,
      method: request.method,
    });
    let body = {};
    let code = 200;
    if (url.pathname === "/api/time")
      body = { serverTimeMs: Date.parse("2026-11-16T10:00:00+07:00") };
    else if (url.pathname === "/api/auth/me")
      body = {
        user: { UserID: 1, Role: role, FullName: "QA Admin", Status: "ACTIVE" },
      };
    else if (url.pathname === "/api/management/dashboard/schedule")
      body = {
        date: "2026-11-16",
        total: mode === "empty" ? 0 : 24,
        items:
          mode === "empty"
            ? []
            : [
                {
                  bookingId: 10,
                  date: "2026-11-16",
                  startTime: "09:00",
                  endTime: "11:00",
                  fieldName: "Sân A1",
                  customerName: "Khách thử nghiệm",
                  phone: "0900000000",
                  status: "CONFIRMED",
                },
              ],
      };
    else if (url.pathname === "/api/admin/reports/summary") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (mode === "error" && from !== to) {
        code = 503;
        body = { message: "Không tải được báo cáo thử nghiệm" };
      } else
        body = {
          from,
          to,
          dateBasis: "database-local",
          revenue: mode === "empty" ? 0 : -100000,
          dailyRevenue: (from === to
            ? [to]
            : [
                "2026-11-10",
                "2026-11-11",
                "2026-11-12",
                "2026-11-13",
                "2026-11-14",
                "2026-11-15",
                to,
              ]
          ).map((date, index) => ({
            date,
            revenue:
              mode === "empty" ? 0 : index === 1 ? -100000 : index * 50000,
          })),
          fieldUtilization:
            mode === "empty"
              ? []
              : [
                  {
                    fieldId: 1,
                    fieldName: "Sân A1",
                    bookedHours: 6,
                    capacityHours: 24,
                    utilizationPercent: 25,
                  },
                ],
        };
    } else if (url.pathname === "/api/admin/cancellation-requests")
      body = {
        requests:
          mode === "empty"
            ? []
            : [
                {
                  requestId: 1,
                  bookingId: 10,
                  customerName: "Khách thử nghiệm",
                  reason: "Đổi lịch",
                  status: "PENDING_REVIEW",
                },
              ],
      };
    else if (url.pathname === "/api/admin/reviews")
      body = {
        items:
          mode === "empty"
            ? []
            : [
                {
                  reviewId: 3,
                  bookingId: 10,
                  fieldName: "Sân A1",
                  customerName: "Khách thử nghiệm",
                  rating: 5,
                  comment: "Sân đẹp",
                  reply: null,
                },
              ],
        unansweredCount: mode === "empty" ? 0 : 1,
        total: mode === "empty" ? 0 : 1,
        totalPages: 1,
        totalReviews: 1,
        page: 1,
      };
    else if (url.pathname === "/api/bookings/") body = { Bookings: [booking] };
    else if (url.pathname === "/api/bookings/10") body = booking;
    else if (url.pathname.endsWith("/cancellation"))
      body = {
        canCancel: false,
        depositPaid: 100000,
        refundableAmount: 100000,
      };
    else if (url.pathname.endsWith("/settlement"))
      body = {
        status: "PARTIALLY_PAID",
        totalAmount: 500000,
        paidAmount: 100000,
        remainingAmount: 400000,
        canConfirm: role === "ADMIN",
      };
    else if (url.pathname.endsWith("/operations")) body = { events: [] };
    send("Fetch.fulfillRequest", {
      requestId,
      responseCode: code,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }],
      body: Buffer.from(JSON.stringify(body)).toString("base64"),
    }).catch(() => {});
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/*" }] });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
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
  const navigate = async () => {
    await send("Page.navigate", { url: base + "/admin" });
    await wait(
      `document.querySelector('.dash-metric strong')?.textContent==='${mode === "empty" ? "0" : "24"}'`,
    );
  };
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "localStorage.setItem('user',JSON.stringify({UserID:1,Role:'ADMIN',Status:'ACTIVE',FullName:'QA Admin'}));localStorage.setItem('accessToken','fixture-only');",
  });
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1600,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate();
  await wait(
    "document.querySelectorAll('.dash-chart rect').length===7 && document.querySelectorAll('.dash-task').length===2",
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.dash-metric').length"),
    4,
  );
  assert.equal(
    await evaluate(
      "document.querySelectorAll('.dash-chart rect[fill=\"#d75b55\"]').length",
    ),
    1,
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.dash-metrics').textContent.includes('-100.000')",
    ),
  );
  assert.equal(
    await evaluate("document.querySelector('.dash-status').textContent"),
    "Đã xác nhận",
  );
  assert.ok(
    await evaluate(
      "document.querySelector('.dash-utilization').textContent.includes('6/24')",
    ),
  );
  assert.equal(
    await evaluate("document.querySelectorAll('.dash-task button').length"),
    0,
  );
  const metricTops = await evaluate(
    "[...document.querySelectorAll('.dash-metric')].map(el=>el.getBoundingClientRect().top)",
  );
  assert.equal(new Set(metricTops).size, 1);
  checks.push(
    "ADMIN: four real-data KPIs in one desktop row, raw booking status, pending tasks, signed revenue and 24-hour denominator",
  );
  await fs.writeFile(
    `${out}/desktop.png`,
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  await evaluate("document.querySelector('.dash-table-scroll a').click()");
  await wait("document.querySelector('.booking-detail-modal')!==null");
  assert.ok(
    await evaluate(
      "document.querySelector('.booking-detail-modal').textContent.includes('#10')",
    ),
  );
  checks.push("Schedule deep link opens the correct booking detail");
  await navigate();
  await wait("document.querySelector('.dash-task.review a')!==null");
  await evaluate("document.querySelector('.dash-task.review a').click()");
  await wait("document.getElementById('review-3')!==null");
  assert.equal(
    await evaluate(
      "document.querySelector('.uc10-admin-heading ~ .uc10-admin-filters select')?.value || new URL(location.href).searchParams.get('status')",
    ),
    "unanswered",
  );
  checks.push("Review deep link reaches unanswered filter and selected review");
  await navigate();
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await pause(100);
  assert.equal(
    await evaluate("document.documentElement.scrollWidth<=innerWidth"),
    true,
  );
  await fs.writeFile(
    `${out}/mobile.png`,
    Buffer.from(
      (await send("Page.captureScreenshot", { format: "png" })).data,
      "base64",
    ),
  );
  checks.push("Mobile has no page-level horizontal overflow");
  mode = "error";
  await navigate();
  await wait("document.querySelector('.dash-bottom [role=alert]')!==null");
  assert.equal(
    await evaluate("document.querySelectorAll('.dash-middle tbody tr').length"),
    1,
  );
  mode = "normal";
  await evaluate("document.querySelector('.dash-toolbar button').click()");
  await wait(
    "document.querySelectorAll('.dash-chart rect').length===7 && !document.querySelector('.dash-bottom [role=alert]')",
  );
  checks.push(
    "Partial report failure preserves schedule; refresh recovers chart",
  );
  mode = "empty";
  await navigate();
  await wait(
    "document.querySelectorAll('.dash-chart rect').length===7 && document.querySelectorAll('.dash-task').length===0",
  );
  assert.equal(
    await evaluate(
      "[...document.querySelectorAll('.dash-metric strong')].every(el=>el.textContent==='0'||el.textContent==='0 đ')",
    ),
    true,
  );
  checks.push(
    "Empty data shows real zero KPIs, empty schedule/tasks/utilization and zero chart",
  );
  role = "STAFF";
  mode = "normal";
  calls.length = 0;
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source:
      "localStorage.setItem('user',JSON.stringify({UserID:1,Role:'STAFF',Status:'ACTIVE',FullName:'QA Staff'}));localStorage.setItem('accessToken','fixture-staff');",
  });
  await navigate();
  assert.equal(
    await evaluate("document.querySelectorAll('.dash-metric').length"),
    1,
  );
  assert.equal(await evaluate("document.querySelector('.dash-bottom')"), null);
  assert.equal(
    calls.some((call) => call.path.startsWith("/api/admin/")),
    false,
  );
  checks.push("STAFF sees schedule only and makes no ADMIN-only API requests");
  assert.equal(
    calls.some((call) => call.method !== "GET"),
    false,
  );
  assert.deepEqual(errors, []);
  await fs.writeFile(
    `${out}/checks.json`,
    JSON.stringify(
      {
        passed: checks.length,
        checks,
        note: "Intercepted fixture APIs, no live booking/payment changes.",
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
