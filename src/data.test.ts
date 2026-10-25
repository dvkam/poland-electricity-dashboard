import { describe, expect, it } from "vitest";
import {
  daySchema,
  latestIndex,
  numberLabel,
  pointSchema,
  renewableEnergyShare,
  shiftDate,
  timeLabel,
} from "./data";
const empty = pointSchema.parse({
  start: "2026-09-13T22:00:00Z",
  end: "2026-09-13T22:15:00Z",
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
  generationMw: null,
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
describe("electricity data semantics", () => {
  it("formats missing data differently from real zero", () => {
    expect(numberLabel(null)).toBe("—");
    expect(numberLabel(0)).toBe("0,0");
  });
  it("rejects unvalidated upstream payloads", () => {
    expect(daySchema.safeParse({ points: [{ demandMw: "10000" }] }).success).toBe(false);
  });
  it("retains negative prices", () => {
    expect(pointSchema.parse({ ...empty, rcePlnMwh: -100 }).rcePlnMwh).toBe(-100);
  });
  it("excludes future and missing generation from latest observation", () => {
    const values = [
      { ...empty, generationMw: 100 },
      { ...empty, start: "2026-09-13T22:15:00Z", end: "2026-09-13T22:30:00Z" },
      { ...empty, generationMw: 300, start: "2026-09-13T22:30:00Z", end: "2026-09-13T22:45:00Z" },
    ];
    expect(latestIndex(values, Date.parse("2026-09-13T22:35:00Z"))).toBe(0);
  });
  it("weights the renewable share by energy, not average percentages", () => {
    expect(
      renewableEnergyShare([
        { ...empty, generationMw: 100, renewablePercent: 100 },
        { ...empty, generationMw: 300, renewablePercent: 0 },
      ]),
    ).toBe(25);
  });
  it("does not infer a renewable share from missing observations", () => {
    expect(renewableEnergyShare([empty])).toBeNull();
  });
  it("uses Warsaw time across spring DST", () => {
    expect(timeLabel("2026-03-29T00:45:00Z")).toBe("01:45");
    expect(timeLabel("2026-03-29T01:00:00Z")).toBe("03:00");
  });
  it("preserves repeated autumn clock labels for distinct UTC instants", () => {
    expect(timeLabel("2026-10-25T00:15:00Z")).toBe("02:15");
    expect(timeLabel("2026-10-25T01:15:00Z")).toBe("02:15");
  });
  it("changes calendar days without drifting across DST", () => {
    expect(shiftDate("2026-03-29", 1)).toBe("2026-03-30");
    expect(shiftDate("2026-10-25", -1)).toBe("2026-10-24");
  });
});
