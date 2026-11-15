import { useEffect, useState } from "react";
import { getArgentinaToday } from "@/lib/date-utils";

/** Keeps the Argentina calendar day current while a tablet remains open. */
export function useHousekeepingDay(): string {
  const [today, setToday] = useState(() => getArgentinaToday());

  useEffect(() => {
    const update = () => {
      const next = getArgentinaToday();
      setToday((current) => (current === next ? current : next));
    };
    const timer = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, []);

  return today;
}
