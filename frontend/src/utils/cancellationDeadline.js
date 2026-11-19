import { businessNow } from "./businessClock";

export function cancellationDeadlinePassed(date, startTime, now = businessNow()) {
  if (!date || !startTime) return false;
  const start = Date.parse(`${date}T${String(startTime).slice(0, 5)}:00+07:00`);
  return Number.isFinite(start) && now >= start - 2 * 60 * 60 * 1000;
}
