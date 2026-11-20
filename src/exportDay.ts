import { borderCodes, fuels } from "./data";
import type { Day, SourceId } from "./data";

type Cell = string | number | boolean | null | undefined;

function csvCell(value: Cell): string {
  if (value == null) return "";
  if (typeof value !== "string") return String(value);
  return /[",\r\n]/.test(value) ? '"' + value.replaceAll('"', '""') + '"' : value;
}

const sourceIds = [
  "generation",
  "flows",
  "prices",
  "guidance",
] as const satisfies readonly SourceId[];

export function dayCsv(day: Day): string {
  const header = [
    "start_utc",
    "end_utc",
    "generation_start_utc",
    "generation_end_utc",
    "generation_mw",
    "demand_mw",
    "renewable_percent",
    "net_physical_import_mw",
    "rce_pln_mwh",
    "generation_interval_minutes",
    ...fuels.map(({ key }) => `generation_${key}_mw`),
    "pumping_mw",
    "price_published_at_utc",
    "guidance_code",
    "guidance_start_utc",
    "guidance_end_utc",
    "guidance_published_at_utc",
    ...borderCodes.flatMap((code) => [
      `${code}_net_import_mw`,
      `${code}_import_mw`,
      `${code}_export_mw`,
      `${code}_import_published_at_utc`,
      `${code}_export_published_at_utc`,
    ]),
    "generation_provider_generated_at_utc",
    ...sourceIds.flatMap((id) => [
      `${id}_endpoint`,
      `${id}_fetched_at_utc`,
      `${id}_cached`,
      `${id}_error`,
    ]),
  ];
  const resources = new Map(day.sources.map((source) => [source.id, source]));
  const provenance = [
    resources.get("generation")?.providerGeneratedAt,
    ...sourceIds.flatMap((id) => {
      const source = resources.get(id);
      return [source?.endpoint, source?.fetchedAt, source?.cached, source?.error];
    }),
  ];
  const rows = day.points.map((p) => {
    const generationMinutes =
      p.generationStart && p.generationEnd
        ? (Date.parse(p.generationEnd) - Date.parse(p.generationStart)) / 60_000
        : null;
    const hour =
      p.guidance !== null || p.guidancePublishedAt !== null
        ? Math.floor(Date.parse(p.start) / 3_600_000) * 3_600_000
        : null;
    const flows = new Map(p.flows.map((flow) => [flow.country, flow]));
    return [
      p.start,
      p.end,
      p.generationStart,
      p.generationEnd,
      p.generationMw,
      p.demandMw,
      p.renewablePercent,
      p.netImportMw,
      p.rcePlnMwh,
      generationMinutes,
      ...fuels.map(({ key }) => p.generation[key]),
      p.pumpingMw,
      p.pricePublishedAt,
      p.guidance,
      hour === null ? null : new Date(hour).toISOString(),
      hour === null ? null : new Date(hour + 3_600_000).toISOString(),
      p.guidancePublishedAt,
      ...borderCodes.flatMap((code) => {
        const flow = flows.get(code);
        return [
          flow?.signedImportMw,
          flow?.importMw,
          flow?.exportMw,
          flow?.importPublishedAt,
          flow?.exportPublishedAt,
        ];
      }),
      ...provenance,
    ]
      .map(csvCell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\r\n") + "\r\n";
}

export function downloadCsv(day: Day) {
  const blob = new Blob([dayCsv(day)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "prad-polski-" + day.date + ".csv";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
