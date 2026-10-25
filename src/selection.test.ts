import { describe, expect, it } from "vitest";
import { intervalLabel, latestIndex, observationState, pointSchema } from "./data";
import { selectedDate } from "./useDashboardDay";

describe("Warsaw observation selection", () => {
  it("keeps the repeated autumn hour unambiguous", () => {
    expect(intervalLabel({ start: "2026-10-25T00:15:00Z", end: "2026-10-25T00:30:00Z" })).toBe(
      "02:15–02:30 (UTC+2)",
    );
    expect(intervalLabel({ start: "2026-10-25T01:15:00Z", end: "2026-10-25T01:30:00Z" })).toBe(
      "02:15–02:30 (UTC+1)",
    );
    expect(intervalLabel({ start: "2026-10-25T00:45:00Z", end: "2026-10-25T01:00:00Z" })).toBe(
      "02:45 UTC+2–02:00 UTC+1",
    );
  });
  it("follows Warsaw midnight without moving an explicit historical day", () => {
    const now = Date.parse("2026-10-24T22:01:00Z");
    expect(selectedDate({ kind: "today" }, now)).toBe("2026-10-25");
    expect(selectedDate({ kind: "history", date: "2026-10-23" }, now)).toBe("2026-10-23");
  });
  it("represents no observation rather than silently selecting a future measurement", () => {
    const point = pointSchema.parse({
      start: "2026-10-24T22:00:00Z",
      end: "2026-10-24T22:15:00Z",
      generationStart: "2026-10-24T22:00:00Z",
      generationEnd: "2026-10-24T22:15:00Z",
      generation: {
        coal: null,
        lignite: null,
        gas: null,
        wind: null,
        solar: null,
        hydro: null,
        biomass: null,
        storage: null,
        other: null,
      },
      generationMw: 100,
      demandMw: null,
      renewablePercent: null,
      pumpingMw: null,
      netImportMw: null,
      flows: [],
      rcePlnMwh: null,
      pricePublishedAt: null,
      guidance: null,
      guidancePublishedAt: null,
    });
    const now = Date.parse("2026-10-24T22:05:00Z");
    expect(latestIndex([], now)).toBeNull();
    expect(latestIndex([point], now)).toBeNull();
    expect(latestIndex([{ ...point, generationMw: null }], now + 3_600_000)).toBeNull();
    expect(observationState(point, "2026-10-25", now)).toBe("Brak pomiaru");
    expect(latestIndex([point], now + 600_000)).toBe(0);
    const hourly = { ...point, generationEnd: "2026-10-24T23:00:00Z" };
    expect(latestIndex([hourly], now + 600_000)).toBeNull();
    expect(latestIndex([hourly], now + 3_600_000)).toBe(0);
  });
});
