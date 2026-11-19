import { businessNow } from "./businessClock";

export function slotHasStarted(date, start, now = businessNow()) {
  if (!date || !start) return false;
  const timestamp = Date.parse(`${date}T${String(start).slice(0, 5)}:00+07:00`);
  return Number.isFinite(timestamp) && timestamp <= now;
}
export function vietnamDate(now = businessNow()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
