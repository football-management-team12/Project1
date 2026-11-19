import { useCallback, useEffect, useState } from "react";
import { getAllBookings } from "../services/booking_service";

const EMPTY = [];

export default function useBookingRange(userId, range) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([userId, range.from, range.to, revision]);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    let timer;
    const load = async () => {
      try {
        const response = await getAllBookings(
          userId,
          { from: range.from, to: range.to },
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setResult({ key, bookings: response.Bookings || [], error: "" });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({
            key,
            bookings: [],
            error: error.message || "Không tải được đơn đặt sân",
          });
        }
      } finally {
        if (!controller.signal.aborted) timer = window.setTimeout(load, 10_000);
      }
    };
    load();
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [userId, range.from, range.to, key]);

  const ready = result?.key === key;
  return {
    bookings: ready ? result.bookings : EMPTY,
    loading: !ready,
    error: ready ? result.error : "",
    refresh,
  };
}
