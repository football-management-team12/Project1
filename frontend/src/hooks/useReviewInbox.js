import { useEffect, useState } from "react";
import { getAdminReviews } from "../services/review_service";

export default function useReviewInbox({ enabled = true, page = 1, pageSize = 10, status = "all", rating = "" } = {}) {
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const key = JSON.stringify([enabled, page, pageSize, status, rating]);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let busy = false;
    let queued = false;
    const load = async () => {
      if (controller.signal.aborted) return;
      if (busy) { queued = true; return; }
      busy = true;
      try {
        const data = await getAdminReviews({ page, pageSize, status, rating }, { signal: controller.signal });
        if (!controller.signal.aborted) setResult({ key, data, error: "", updatedAt: Date.now() });
      } catch (err) {
        if (!controller.signal.aborted) setResult(previous => ({ key, data: previous?.key === key ? previous.data : null, error: err.message }));
      } finally { busy = false; if (queued && !controller.signal.aborted) { queued = false; load(); } }
    };
    const visibleLoad = () => { if (document.visibilityState !== "hidden") load(); };
    load();
    const timer = window.setInterval(visibleLoad, 30000);
    window.addEventListener("focus", visibleLoad);
    window.addEventListener("reviews-updated", visibleLoad);
    document.addEventListener("visibilitychange", visibleLoad);
    return () => {
      controller.abort(); window.clearInterval(timer);
      window.removeEventListener("focus", visibleLoad);
      window.removeEventListener("reviews-updated", visibleLoad);
      document.removeEventListener("visibilitychange", visibleLoad);
    };
  }, [enabled, page, pageSize, status, rating, key, revision]);
  return { data: enabled && result?.key === key ? result.data : null,
    error: enabled && result?.key === key ? result.error : "",
    loading: enabled && result?.key !== key,
    updatedAt: result?.key === key ? result.updatedAt : null,
    refresh: () => setRevision(value => value + 1) };
}
