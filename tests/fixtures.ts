import type { Day, Point } from "../src/data";

// Deterministic browser-test data only. Production never imports this module.
export function fixtureDay(date = "2026-10-25"): Day {
  const spring = date === "2026-03-29";
  const autumn = date === "2026-10-25";
  const length = spring ? 92 : autumn ? 100 : 96;
  const start = Date.parse(date + (spring ? "T00:00:00+01:00" : "T00:00:00+02:00"));
  const points = Array.from({ length }, (_, index): Point => ({
    start: new Date(start + index * 900_000).toISOString(),
    end: new Date(start + (index + 1) * 900_000).toISOString(),
    generation: {
      coal: 8000,
      lignite: 4000,
      gas: 2000,
      wind: 3000,
      solar: 1000,
      hydro: 200,
      biomass: 400,
      storage: 300,
      other: 100,
    },
    generationMw: 19000,
    demandMw: 20000,
    renewablePercent: 25,
    pumpingMw: 100,
    netImportMw: 1000,
    flows: [],
    rcePlnMwh: index === 10 ? -42 : 200 + index,
    pricePublishedAt: null,
    guidance: 1,
    guidancePublishedAt: null,
  }));
  return {
    schemaVersion: 1,
    date,
    timezone: "Europe/Warsaw",
    generatedAt: "2026-10-25T12:00:00Z",
    points,
    sources: [
      {
        id: "generation",
        name: "Test source",
        url: "https://example.com/",
        endpoint: "https://example.com/data",
        note: "Browser fixture",
        fetchedAt: "2026-10-25T12:00:00Z",
        cached: false,
        error: null,
      },
    ],
  };
}
