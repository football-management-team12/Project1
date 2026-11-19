import { apiRequest } from "../services/api";

let anchor = null;
let pending = null;
let lastAttempt = -Infinity;

export function businessNow() {
  return anchor ? anchor.serverTime + performance.now() - anchor.observedAt : Date.now();
}

export function syncBusinessClock() {
  if (pending) return pending;
  if (performance.now() - lastAttempt < 60_000) return Promise.resolve();
  lastAttempt = performance.now();
  const start = performance.now();
  pending = apiRequest("/api/time", { auth: false, signal: AbortSignal.timeout(3000) }).then(data => {
    if (Number.isFinite(data.serverTimeMs)) anchor = { serverTime: data.serverTimeMs, observedAt: (start + performance.now()) / 2 };
  }).catch(() => {}).finally(() => { pending = null; });
  return pending;
}

export function formatBusinessTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("vi-VN", { timeZone:"Asia/Ho_Chi_Minh", dateStyle:"short", timeStyle:"medium" }).format(date);
}
