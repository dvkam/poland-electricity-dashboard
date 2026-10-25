import { useEffect, useState } from "react";
import { today } from "./data";

type DaySelection = { kind: "today" } | { kind: "history"; date: string };

export function selectedDate(selection: DaySelection, now: number): string {
  return selection.kind === "today" ? today(now) : selection.date;
}

export function useDashboardDay() {
  const [selection, setSelection] = useState<DaySelection>({ kind: "today" });
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return {
    date: selectedDate(selection, now),
    now,
    selectDate: (date: string) => {
      const current = Date.now();
      setNow(current);
      setSelection(date === today(current) ? { kind: "today" } : { kind: "history", date });
    },
  };
}
