import { expect, test } from "vitest";
import { fixtureDay } from "../tests/fixtures";
import { dayCsv } from "./exportDay";

test("preserves hourly source boundaries, zeroes and one-sided border readings", () => {
  const day = fixtureDay("2026-03-29");
  const point = day.points[0]!;
  point.generationEnd = day.points[3]!.end;
  point.rcePlnMwh = 0;
  point.guidance = null;
  point.flows = [
    {
      country: "CZ",
      from: "CZ",
      to: "PL",
      kind: "physical",
      mw: null,
      signedImportMw: null,
      importMw: 20,
      exportMw: null,
      publishedAt: null,
      importPublishedAt: "2026-03-29T03:01:00Z",
    },
  ];
  const [head, first, ...rest] = dayCsv(day).trimEnd().split("\r\n");
  expect(rest).toHaveLength(91);
  const values = first!.split(",");
  const row = Object.fromEntries(head!.split(",").map((key, index) => [key, values[index]]));
  expect(row).toMatchObject({
    generation_interval_minutes: "60",
    generation_end_utc: day.points[3]!.end,
    rce_pln_mwh: "0",
    guidance_start_utc: "",
    guidance_end_utc: "",
    CZ_net_import_mw: "",
    CZ_import_mw: "20",
    CZ_export_mw: "",
    DE_net_import_mw: "",
    CZ_import_published_at_utc: "2026-03-29T03:01:00Z",
    CZ_export_published_at_utc: "",
    generation_endpoint: "https://example.com/data",
    generation_fetched_at_utc: "2026-10-25T12:00:00Z",
    generation_cached: "false",
    prices_fetched_at_utc: "",
    prices_cached: "",
  });
});

test("quotes source messages containing delimiters", () => {
  const day = fixtureDay();
  day.sources[0]!.error = 'A, "B"\nC';
  expect(dayCsv(day)).toContain('"A, ""B""\nC"');
});
