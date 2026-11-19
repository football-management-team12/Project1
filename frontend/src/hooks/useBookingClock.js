import { useEffect, useState } from "react";
import { businessNow, syncBusinessClock } from "../utils/businessClock";

export default function useBookingClock() {
  const [now, setNow] = useState(businessNow);
  useEffect(() => {
    let active = true;
    const update = () => { if (active) setNow(businessNow()); };
    const synchronize = () => { syncBusinessClock().then(update); };
    synchronize();
    const timer = window.setInterval(update, 1000);
    const syncTimer = window.setInterval(synchronize, 60_000);
    window.addEventListener("focus", synchronize);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(syncTimer);
      window.removeEventListener("focus", synchronize);
    };
  }, []);
  return now;
}
