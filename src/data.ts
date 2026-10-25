import { z } from "zod";

const nullableNumber = z.number().finite().nullable();
const timestamp = z.string().datetime({ offset: true });
export const fuels = [
  { key: "coal", label: "Węgiel kamienny", short: "Węgiel", color: "#465264" },
  { key: "lignite", label: "Węgiel brunatny", short: "Brunatny", color: "#8a98a8" },
  { key: "gas", label: "Gaz", short: "Gaz", color: "#b3bac6" },
  { key: "wind", label: "Wiatr", short: "Wiatr", color: "#3f9b8f" },
  { key: "solar", label: "Słońce", short: "Słońce", color: "#efbb48" },
  { key: "hydro", label: "Woda", short: "Woda", color: "#559aca" },
  { key: "biomass", label: "Biomasa", short: "Biomasa", color: "#8baf6d" },
  { key: "storage", label: "Magazyny wodne", short: "Magazyny", color: "#9c87bc" },
  { key: "other", label: "Pozostałe", short: "Inne", color: "#c4cbd3" },
] as const;
export type Fuel = (typeof fuels)[number]["key"];
export const sourceSchema = z.object({
  id: z.enum(["generation", "flows", "prices", "guidance"]),
  name: z.string(),
  url: z.string().url(),
  endpoint: z.string().url(),
  note: z.string(),
  fetchedAt: timestamp.nullable(),
  cached: z.boolean(),
  error: z.string().nullable(),
});
export const pointSchema = z.object({
  start: timestamp,
  end: timestamp,
  generation: z.object({
    coal: nullableNumber,
    lignite: nullableNumber,
    gas: nullableNumber,
    wind: nullableNumber,
    solar: nullableNumber,
    hydro: nullableNumber,
    biomass: nullableNumber,
    storage: nullableNumber,
    other: nullableNumber,
  }),
  generationMw: nullableNumber,
  demandMw: nullableNumber,
  renewablePercent: nullableNumber,
  pumpingMw: nullableNumber,
  netImportMw: nullableNumber,
  flows: z.array(
    z.object({
      country: z.enum(["DE", "CZ", "SK", "UA", "LT", "SE"]),
      from: z.string(),
      to: z.string(),
      mw: nullableNumber,
      signedImportMw: nullableNumber,
      kind: z.literal("physical"),
      publishedAt: timestamp.nullable(),
    }),
  ),
  rcePlnMwh: nullableNumber,
  pricePublishedAt: timestamp.nullable(),
  guidance: z.number().int().min(0).max(3).nullable(),
  guidancePublishedAt: timestamp.nullable(),
});
export const daySchema = z.object({
  schemaVersion: z.literal(1),
  date: z.string(),
  timezone: z.literal("Europe/Warsaw"),
  generatedAt: timestamp,
  sources: z.array(sourceSchema),
  points: z.array(pointSchema).min(92).max(100),
});
export type Day = z.infer<typeof daySchema>;
export type Point = z.infer<typeof pointSchema>;
export type Source = z.infer<typeof sourceSchema>;
export type SourceId = Source["id"];

export const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
export const fullTime = (iso: string) =>
  new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    dateStyle: "medium",
    timeStyle: "long",
  }).format(new Date(iso));
const offsetFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Warsaw",
  timeZoneName: "shortOffset",
});
export function timeOffset(iso: string): string {
  return (
    offsetFormatter
      .formatToParts(new Date(iso))
      .find((part) => part.type === "timeZoneName")
      ?.value.replace("GMT", "UTC") ?? "Europe/Warsaw"
  );
}
export function intervalLabel(point: Pick<Point, "start" | "end">): string {
  const startOffset = timeOffset(point.start);
  const endOffset = timeOffset(point.end);
  return startOffset === endOffset
    ? `${timeLabel(point.start)}–${timeLabel(point.end)} (${startOffset})`
    : `${timeLabel(point.start)} ${startOffset}–${timeLabel(point.end)} ${endOffset}`;
}
export const numberLabel = (value: number | null, digits = 1) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("pl-PL", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      }).format(value);
export const today = (now = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
export function shiftDate(date: string, days: number): string {
  const result = new Date(date + "T12:00:00Z");
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Warsaw",
  }).format(new Date(date + "T12:00:00Z"));

export function latestIndex(points: readonly Point[], now = Date.now()): number | null {
  let index: number | null = null;
  points.forEach((point, i) => {
    if (point.generationMw !== null && Date.parse(point.end) <= now) index = i;
  });
  return index;
}

export function observationState(point: Point | undefined, date: string, now = Date.now()): string {
  if (!point || point.generationMw === null || Date.parse(point.end) > now) return "Brak pomiaru";
  if (date !== today(now)) return "Dane historyczne";
  const age = now - Date.parse(point.end);
  if (age > 3_600_000) return "Dane opóźnione";
  return "Ostatni pomiar";
}

export function renewableEnergyShare(points: readonly Point[]): number | null {
  let renewable = 0;
  let total = 0;
  for (const point of points) {
    if (point.generationMw === null || point.renewablePercent === null) continue;
    const hours = (Date.parse(point.end) - Date.parse(point.start)) / 3_600_000;
    total += point.generationMw * hours;
    renewable += ((point.generationMw * point.renewablePercent) / 100) * hours;
  }
  return total > 0 ? (renewable / total) * 100 : null;
}

export const tariffCopy = {
  G11: {
    title: "Nawet gdy cena na giełdzie spada, Twoja stawka nie zmienia się z godziny na godzinę.",
    text: "Przy stałej, jednostrefowej cenie energii przesunięcie tego samego zużycia na inną porę zwykle nie obniża kosztu. RCE nie jest ceną Twojej umowy.",
    note: "Najpierw sprawdź cenę energii i opłaty na swojej fakturze.",
  },
  G12: {
    title: "Liczą się strefy Twojej taryfy.",
    text: "W taryfie strefowej koszt zależy od godzin i warunków określonych w umowie oraz taryfie dystrybucyjnej. Dzisiejszy wykres RCE nie wyznacza tych stref.",
    note: "Godziny i stawki mogą różnić się między operatorami i ofertami.",
  },
  dynamic: {
    title: "Sprawdź, jaki indeks rozlicza Twoja umowa.",
    text: "Cena dynamiczna może zależeć od innego indeksu niż RCE. Do ceny energii dochodzą składniki umowy, dystrybucja i podatki. Ujemne RCE nie oznacza automatycznie darmowego prądu.",
    note: "Nie obliczamy tutaj rachunku ani oszczędności.",
  },
  PV: {
    title: "Własny prąd ma własną ekonomię.",
    text: "Autokonsumpcja może mieć wartość także przy stałej cenie zakupu. Wynik zależy od Twojej produkcji, zużycia i sposobu rozliczania nadwyżek: opustów, RCEm lub RCE.",
    note: "Krajowa produkcja PV nie jest prognozą Twojej instalacji.",
  },
} as const;
export type Tariff = keyof typeof tariffCopy;
