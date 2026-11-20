import { memo, useState } from "react";
import { ArrowUpRight, Leaf, Sun, Zap } from "lucide-react";
import {
  completedGeneration,
  intervalLabel,
  numberLabel,
  renewableEnergyShare,
  renewableEnergyWeight,
} from "./data";
import type { Day, Point } from "./data";
import "./coverage.css";

type Interval = Pick<Point, "start" | "end">;
type Reading = Interval & { index: number };
const hoursFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

function coveredTime(quarters: number, dayQuarters: number) {
  return `${hoursFormat.format(quarters / 4)} z ${dayQuarters / 4} godz.`;
}

function generationInterval(point: Point): Interval {
  return { start: point.generationStart ?? point.start, end: point.generationEnd ?? point.end };
}

function readings(
  points: readonly Point[],
  included: (point: Point) => boolean,
  generation: boolean,
) {
  const intervals: Reading[] = [];
  points.forEach((point, index) => {
    if (!included(point)) return;
    const { start, end } = generation ? generationInterval(point) : point;
    if (intervals.at(-1)?.start !== start) intervals.push({ index, start, end });
  });
  return intervals;
}

function coverage(
  points: readonly Point[],
  present: (point: Point) => boolean,
  sourceInterval: (point: Point) => Interval = (point) => point,
) {
  const gaps: Interval[] = [];
  let latest: Point | undefined;
  let count = 0;
  for (const point of points) {
    if (present(point)) {
      latest = point;
      count++;
    } else {
      const gap = gaps.at(-1);
      if (gap?.end === point.start) gap.end = point.end;
      else gaps.push({ start: point.start, end: point.end });
    }
  }
  return { count, latest: latest && sourceInterval(latest), gaps };
}

function guidanceInterval(point: Point): Interval {
  const hour = Math.floor(Date.parse(point.start) / 3_600_000) * 3_600_000;
  return { start: new Date(hour).toISOString(), end: new Date(hour + 3_600_000).toISOString() };
}

function summarize(points: readonly Point[], now: number) {
  const complete = (p: Point) => completedGeneration(p, now);
  const solar = (p: Point) => complete(p) && p.generation.solar !== null;
  const eligible = (p: Point) => complete(p) && renewableEnergyWeight(p) > 0;
  const price = (p: Point) => p.rcePlnMwh !== null;
  const solarValues = points.filter(solar).map((p) => p.generation.solar!);
  const prices = points.filter(price).map((p) => p.rcePlnMwh!);
  const peak = solarValues.length ? Math.max(...solarValues) : null;
  const minimum = prices.length ? Math.min(...prices) : null;
  const renewable = points.filter(eligible);
  return {
    peak,
    minimum,
    share: renewableEnergyShare(renewable),
    solarCount: solarValues.length,
    priceCount: prices.length,
    renewableCount: renewable.length,
    peaks: readings(points, (p) => solar(p) && p.generation.solar === peak, true),
    minima: readings(points, (p) => price(p) && p.rcePlnMwh === minimum, false),
    contributors: readings(points, eligible, true),
    feeds: [
      {
        name: "Łączna produkcja",
        ...coverage(points, (p) => complete(p) && p.generationMw !== null, generationInterval),
      },
      { name: "Cena RCE", ...coverage(points, price) },
      { name: "Saldo sześciu granic", ...coverage(points, (p) => p.netImportMw !== null) },
      {
        name: "Wskazanie Kompasu",
        ...coverage(points, (p) => p.guidance !== null, guidanceInterval),
      },
    ],
  };
}

function IntervalLinks({
  items,
  title,
  onSelect,
}: {
  items: Reading[];
  title: string;
  onSelect: (index: number) => void;
}) {
  const [open, setOpen] = useState(false);
  function link(item: Reading) {
    return (
      <button className="text-link" type="button" onClick={() => onSelect(item.index)}>
        {intervalLabel(item)} <ArrowUpRight size={14} aria-hidden />
      </button>
    );
  }
  const [first] = items;
  if (!first) return null;
  if (items.length === 1) return link(first);
  return (
    <details className="summary-intervals" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {title} ({items.length})
      </summary>
      {open && (
        <ul>
          {items.map((item) => (
            <li key={item.start}>{link(item)}</li>
          ))}
        </ul>
      )}
    </details>
  );
}

export const DailySummary = memo(function DailySummary({
  day,
  now,
  onSelect,
}: {
  day: Day;
  now: number;
  onSelect: (index: number) => void;
}) {
  const summary = summarize(day.points, now);
  const time = (count: number) => coveredTime(count, day.points.length);
  function inspect(index: number, target: string) {
    onSelect(index);
    document.getElementById(target)?.focus();
  }
  return (
    <section className="stories-section" aria-labelledby="stories-heading">
      <div className="section-title">
        <h2 id="stories-heading">Podsumowanie dnia</h2>
      </div>
      <div className="stories-grid">
        <article className="story">
          <span className="story-icon solar">
            <Sun size={20} />
          </span>
          <span className="story-kicker">SŁONECZNE MAKSIMUM</span>
          <h3>
            {summary.peak === null
              ? "Brak pomiarów PV"
              : numberLabel(summary.peak / 1000, 2) + " GW ze słońca"}
          </h3>
          <p>Najwyższa średnia moc PV. Zakończone pomiary obejmują {time(summary.solarCount)}</p>
          <IntervalLinks
            items={summary.peaks}
            title="Przedziały z maksimum"
            onSelect={(i) => inspect(i, "timeline-slider")}
          />
        </article>
        <article className="story">
          <span className="story-icon green">
            <Leaf size={20} />
          </span>
          <span className="story-kicker">UDZIAŁ ODNAWIALNYCH</span>
          <h3>
            {summary.share === null
              ? "Brak danych do obliczenia udziału"
              : numberLabel(summary.share, 1) + "% z OZE"}
          </h3>
          <p>
            Szacunek ważony energią z produkcji bez rozładowania magazynów. Uwzględniono{" "}
            {time(summary.renewableCount)}
          </p>
          <IntervalLinks
            items={summary.contributors}
            title="Pomiary w obliczeniu"
            onSelect={(i) => inspect(i, "timeline-slider")}
          />
        </article>
        <article className="story">
          <span className="story-icon rose">
            <Zap size={20} />
          </span>
          <span className="story-kicker">MINIMUM RYNKOWE</span>
          <h3>
            {summary.minimum === null ? "Brak cen" : numberLabel(summary.minimum, 2) + " zł/MWh"}
          </h3>
          <p>Najniższa opublikowana cena RCE. Ceny obejmują {time(summary.priceCount)}</p>
          <IntervalLinks
            items={summary.minima}
            title="Przedziały z minimum"
            onSelect={(i) => inspect(i, "price-heading")}
          />
        </article>
      </div>
      <details className="summary-coverage">
        <summary>Dostępność danych w ciągu dnia</summary>
        <div className="coverage-grid">
          {summary.feeds.map((feed) => (
            <section className="coverage-feed" key={feed.name}>
              <h3>{feed.name}</h3>
              <strong>{time(feed.count)}</strong>
              {feed.latest && <p>Ostatni dostępny przedział: {intervalLabel(feed.latest)}</p>}
              {feed.gaps.length > 0 && (
                <>
                  <p>Bez odczytu</p>
                  <ul>
                    {feed.gaps.map((gap) => (
                      <li key={gap.start}>{intervalLabel(gap)}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          ))}
        </div>
      </details>
    </section>
  );
});
