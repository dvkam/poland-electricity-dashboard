import { ArrowUpRight } from "lucide-react";
import { useChartWidth } from "./useChartWidth";
import { numberLabel, timeLabel } from "./data";
import type { Day } from "./data";
export function PriceChart({
  day,
  selected,
  onSelect,
  onEvidence,
}: {
  day: Day;
  selected: number;
  onSelect: (index: number) => void;
  onEvidence: () => void;
}) {
  const valid = day.points.flatMap((point) => (point.rcePlnMwh === null ? [] : [point.rcePlnMwh]));
  const min = valid.length ? Math.min(...valid) : null;
  const max = valid.length ? Math.max(...valid) : null;
  const low = Math.min(0, min ?? 0);
  const high = Math.max(100, max ?? 100);
  const y = (value: number) => 135 - ((value - low) / (high - low)) * 112;
  const { ref, width } = useChartWidth<SVGSVGElement>(810);
  const step = (width - 50) / day.points.length;
  return (
    <section className="panel price-panel" aria-labelledby="price-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">CENA RYNKOWA · PLN/MWh</span>
          <h2 id="price-heading">Ile kosztuje energia na rynku?</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Źródło i definicja RCE"
          onClick={onEvidence}
        >
          <ArrowUpRight size={19} />
        </button>
      </div>
      <div className="price-range">
        <span>
          Minimum <b>{numberLabel(min, 2)}</b>
        </span>
        <span>
          Maksimum <b>{numberLabel(max, 2)}</b>
        </span>
        <span className="price-selected">
          {numberLabel(day.points[selected]?.rcePlnMwh ?? null, 2)} <small>wybrany kwadrans</small>
        </span>
      </div>
      <svg
        className="price-chart"
        ref={ref}
        viewBox={`0 0 ${width} 169`}
        role="img"
        aria-label="Rynkowa Cena Energii dla wybranego dnia"
        onPointerMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - box.left) / box.width) * width;
          onSelect(Math.max(0, Math.min(day.points.length - 1, Math.floor((x - 38) / step))));
        }}
      >
        <line x1="38" x2={width - 12} y1={y(0)} y2={y(0)} stroke="#dce2e8" />
        <text x="30" y={y(0) + 4} textAnchor="end" className="axis-label">
          0
        </text>
        {day.points.map((point, index) =>
          point.rcePlnMwh === null ? null : (
            <rect
              key={point.start}
              x={38 + index * step}
              y={Math.min(y(0), y(point.rcePlnMwh))}
              width={Math.max(1, step - 1.2)}
              height={Math.max(1, Math.abs(y(point.rcePlnMwh) - y(0)))}
              rx="1"
              fill={index === selected ? "#cf3346" : point.rcePlnMwh < 0 ? "#3f9b8f" : "#eeb5ba"}
            />
          ),
        )}
        {day.points.map((point, index) =>
          index % 16 === 0 ? (
            <text key={point.start} x={38 + index * step} y="161" className="axis-label">
              {timeLabel(point.start)}
            </text>
          ) : null,
        )}
      </svg>
      <p className="chart-footnote">
        Wskaźnik RCE publikowany przez PSE. To nie jest pełna cena na rachunku ani indeks każdej
        oferty dynamicznej.
      </p>
    </section>
  );
}
