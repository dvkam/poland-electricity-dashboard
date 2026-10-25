import { useState } from "react";
import { ChartNoAxesCombined } from "lucide-react";
import { useChartWidth } from "./useChartWidth";
import { fuels, generationIntervalLabel, numberLabel, timeLabel } from "./data";
import type { Day } from "./data";

type Props = { day: Day; selected: number; onSelect: (index: number) => void };
export function Timeline({ day, selected, onSelect }: Props) {
  const [view, setView] = useState<"mix" | "demand">("mix");
  const points = day.points;
  const chosen = points[selected];
  const { ref, width } = useChartWidth<HTMLDivElement>(900);
  const height = 252;
  const left = 46;
  const right = 14;
  const top = 18;
  const bottom = 29;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxValue = Math.max(
    10_000,
    ...points.map((point) => Math.max(point.generationMw ?? 0, point.demandMw ?? 0)),
  );
  const ceiling = Math.ceil(maxValue / 5000) * 5000;
  const step = plotWidth / points.length;
  const y = (value: number) => top + plotHeight - (value / ceiling) * plotHeight;
  const demandSegments: string[] = [];
  let current = "";
  points.forEach((point, index) => {
    if (point.demandMw === null) {
      if (current) demandSegments.push(current);
      current = "";
    } else {
      current += (current ? " L" : "M") + (left + index * step) + "," + y(point.demandMw);
      current += " L" + (left + (index + 1) * step) + "," + y(point.demandMw);
    }
  });
  if (current) demandSegments.push(current);
  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">JEDEN DZIEŃ, CAŁY OBRAZ</span>
          <h2 id="timeline-heading">Skąd bierze się nasz prąd?</h2>
        </div>
        <ChartNoAxesCombined size={21} className="muted" />
      </div>
      <div className="chart-toolbar">
        <div className="segmented" aria-label="Widok wykresu">
          <button type="button" aria-pressed={view === "mix"} onClick={() => setView("mix")}>
            Miks produkcji
          </button>
          <button type="button" aria-pressed={view === "demand"} onClick={() => setView("demand")}>
            Zapotrzebowanie
          </button>
        </div>
        <span className="interval-label">{chosen ? generationIntervalLabel(chosen) : "—"}</span>
      </div>
      <div className="chart-container" ref={ref}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Wykres produkcji i zapotrzebowania. Wybierz kwadrans suwakiem poniżej."
          onPointerMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            const x = ((event.clientX - bounds.left) / bounds.width) * width;
            onSelect(Math.min(points.length - 1, Math.max(0, Math.floor((x - left) / step))));
          }}
        >
          <defs>
            <pattern id="no-data" width="5" height="5" patternUnits="userSpaceOnUse">
              <path d="M0 5L5 0" stroke="#dde2e8" strokeWidth="1" />
            </pattern>
          </defs>
          {[0, 1, 2, 3, 4].map((tick) => {
            const value = (ceiling * tick) / 4;
            return (
              <g key={tick}>
                <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#edf0f3" />
                <text x={left - 10} y={y(value) + 4} textAnchor="end" className="axis-label">
                  {numberLabel(value / 1000, 0)}
                </text>
              </g>
            );
          })}
          <text x={left - 10} y={10} textAnchor="end" className="axis-label">
            GW
          </text>
          {view === "mix" &&
            points.map((point, index) => {
              let base = 0;
              if (point.generationMw === null)
                return (
                  <rect
                    key={point.start}
                    x={left + index * step}
                    y={top}
                    width={step}
                    height={plotHeight}
                    fill="url(#no-data)"
                    opacity={0.5}
                  />
                );
              return (
                <g key={point.start}>
                  {fuels.map((fuel) => {
                    const value = point.generation[fuel.key] ?? 0;
                    base += value;
                    return (
                      <rect
                        key={fuel.key}
                        x={left + index * step}
                        y={y(base)}
                        width={step + 0.3}
                        height={Math.max(0, (value / ceiling) * plotHeight)}
                        fill={fuel.color}
                      />
                    );
                  })}
                </g>
              );
            })}
          {demandSegments.map((path) => (
            <path
              key={path}
              d={path}
              fill="none"
              stroke={view === "mix" ? "#263242" : "#df3545"}
              strokeWidth={view === "mix" ? 2 : 3}
              strokeDasharray={view === "mix" ? "5 4" : undefined}
            />
          ))}
          <line
            x1={left + (selected + 0.5) * step}
            x2={left + (selected + 0.5) * step}
            y1={top}
            y2={y(0)}
            stroke="#d83245"
            strokeWidth={1.5}
          />
          {chosen?.demandMw !== null && chosen?.demandMw !== undefined && (
            <circle
              cx={left + (selected + 0.5) * step}
              cy={y(chosen.demandMw)}
              r={4}
              fill="#df3545"
              stroke="white"
              strokeWidth={2}
            />
          )}
          {points.map((point, index) =>
            index % 16 === 0 ? (
              <text key={point.start} x={left + index * step} y={height - 5} className="axis-label">
                {timeLabel(point.start)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
      <label className="sr-only" htmlFor="timeline-slider">
        Wybierz kwadrans
      </label>
      <input
        id="timeline-slider"
        className="timeline-slider"
        type="range"
        min={0}
        max={points.length - 1}
        value={selected}
        onChange={(event) => onSelect(Number(event.target.value))}
        aria-valuetext={
          chosen ? timeLabel(chosen.start) + " " + new Date(chosen.start).toISOString() : ""
        }
      />
      <div className="chart-legend">
        {fuels.map((fuel) => (
          <span key={fuel.key}>
            <i style={{ background: fuel.color }} />
            {fuel.short}
          </span>
        ))}
        <span>
          <i className="dashed" />
          Popyt
        </span>
      </div>
      <div className="chart-footnote">
        Wybierz kwadrans suwakiem. Historyczne średnie godzinowe produkcji i popytu obejmują cztery
        kwadranse, nie są osobnymi pomiarami. Kreskowanie oznacza brak danych.
      </div>
    </section>
  );
}
