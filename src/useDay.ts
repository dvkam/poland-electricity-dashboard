import { useCallback, useEffect, useState } from "react";
import { daySchema } from "./data";
import type { Day } from "./data";
type Result = { key: string; data: Day | null; error: string | null };
export function useDay(date: string) {
  const [result, setResult] = useState<Result | null>(null);
  const [revision, setRevision] = useState(0);
  const key = date + ":" + revision;
  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    let active = true;
    async function load() {
      try {
        const response = await fetch("/api/v1/day?date=" + encodeURIComponent(date), {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error("Nie udało się pobrać danych. Spróbuj ponownie za chwilę.");
        const json: unknown = await response.json();
        const parsed = daySchema.safeParse(json);
        if (!parsed.success || parsed.data.date !== date)
          throw new Error(
            "Odpowiedź źródła ma nieoczekiwany format. Dane nie zostały wyświetlone.",
          );
        if (active) setResult({ key, data: parsed.data, error: null });
      } catch (caught) {
        const error =
          caught instanceof Error && caught.name !== "AbortError"
            ? caught.message
            : "Oczekiwanie na dane trwało zbyt długo. Spróbuj ponownie.";
        if (active) setResult((previous) => ({ key, data: previous?.data ?? null, error }));
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [date, key]);
  useEffect(() => {
    const id = window.setInterval(refresh, 300_000);
    return () => window.clearInterval(id);
  }, [refresh]);
  return {
    data: result?.data?.date === date ? result.data : null,
    loading: result?.key !== key,
    error: result?.key === key ? result.error : null,
    refresh,
  };
}
