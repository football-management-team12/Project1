import { useCallback, useEffect, useState } from "react";
import { getAdminCancellationRequests } from "../services/cancellation_service";

export default function useCancellationInbox(enabled) {
  const [data, setData] = useState({ requests: [], error: "", loading: true });
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let timer;
    const load = async () => {
      try {
        const response = await getAdminCancellationRequests("PENDING_REVIEW");
        if (active) setData({ requests: response.requests || [], error: "", loading: false });
      } catch (error) {
        if (active) setData(previous => ({ ...previous, error: error.message || "Không tải được yêu cầu hủy", loading: false }));
      } finally {
        if (active) timer = window.setTimeout(load, 10_000);
      }
    };
    load();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearTimeout(timer); window.removeEventListener("focus", refresh); };
  }, [enabled, revision, refresh]);
  return { ...data, refresh };
}
