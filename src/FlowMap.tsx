import { ArrowDownLeft, ArrowUpRight, MoveUpRight } from "lucide-react";
import { numberLabel, timeLabel } from "./data";
import type { Point } from "./data";
const countries = [
  { code: "SE", name: "Szwecja", x: 128, y: 45 },
  { code: "LT", name: "Litwa", x: 355, y: 45 },
  { code: "DE", name: "Niemcy", x: 75, y: 145 },
  { code: "UA", name: "Ukraina", x: 403, y: 145 },
  { code: "CZ", name: "Czechy", x: 128, y: 247 },
  { code: "SK", name: "Słowacja", x: 355, y: 247 },
] as const;
export function FlowMap({
  point,
  onEvidence,
}: {
  point: Point | undefined;
  onEvidence: () => void;
}) {
  return (
    <section className="panel flow-panel" aria-labelledby="flow-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">POŁĄCZENI Z EUROPĄ</span>
          <h2 id="flow-heading">Przez nasze granice</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onEvidence}
          aria-label="Źródła przepływów"
        >
          <MoveUpRight size={19} />
        </button>
      </div>
      <div className="flow-summary">
        <strong>
          {point?.netImportMw === null || point?.netImportMw === undefined
            ? "—"
            : numberLabel(Math.abs(point.netImportMw) / 1000, 2)}{" "}
          <small>GW</small>
        </strong>
        <span>
          {point?.netImportMw === null || point?.netImportMw === undefined
            ? "Niepełne dane o przepływach"
            : point.netImportMw > 0
              ? "import netto do Polski"
              : point.netImportMw < 0
                ? "eksport netto z Polski"
                : "wymiana zbilansowana"}
        </span>
      </div>
      <svg
        className="flow-map"
        viewBox="0 0 480 295"
        role="img"
        aria-label="Schemat fizycznych przepływów między Polską i sześcioma sąsiadami"
      >
        <defs>
          <pattern id="map-dots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.8" fill="#dce2e8" />
          </pattern>
          <marker
            id="import-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="#c18a24" />
          </marker>
          <marker
            id="export-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" fill="#548aa5" />
          </marker>
        </defs>
        <rect width="480" height="295" fill="url(#map-dots)" />
        {countries.map((country) => {
          const flow = point?.flows.find((item) => item.country === country.code);
          const value = flow?.signedImportMw ?? null;
          const importing = value !== null && value > 0;
          const empty = value === null || value === 0;
          const dx = country.x - 240;
          const dy = country.y - 146;
          const distance = Math.hypot(dx, dy);
          const inner = { x: 240 + (dx / distance) * 43, y: 146 + (dy / distance) * 43 };
          const outer = {
            x: country.x - (dx / distance) * 34,
            y: country.y - (dy / distance) * 34,
          };
          return (
            <g key={country.code}>
              <line
                x1={importing ? outer.x : inner.x}
                y1={importing ? outer.y : inner.y}
                x2={importing ? inner.x : outer.x}
                y2={importing ? inner.y : outer.y}
                stroke={empty ? "#bfc9d3" : importing ? "#c18a24" : "#548aa5"}
                strokeWidth={empty ? 1 : 2}
                strokeDasharray="4 5"
                markerEnd={
                  empty ? undefined : importing ? "url(#import-arrow)" : "url(#export-arrow)"
                }
              />
              <rect
                x={country.x - 37}
                y={country.y - 27}
                width="74"
                height="60"
                rx="9"
                fill="white"
                stroke="#e4e8ed"
              />
              <text x={country.x} y={country.y - 10} textAnchor="middle" className="country-name">
                {country.name}
              </text>
              <text x={country.x} y={country.y + 12} textAnchor="middle" className="country-value">
                {numberLabel(value === null ? null : Math.abs(value), 0)}
              </text>
            </g>
          );
        })}
        <circle cx="240" cy="146" r="40" fill="#fff1f2" stroke="#f2c5ca" />
        <rect x="231" y="128" width="18" height="6" rx="1" fill="white" stroke="#eee" />
        <rect x="231" y="134" width="18" height="6" rx="1" fill="#df3545" />
        <text x="240" y="161" textAnchor="middle" className="poland-name">
          Polska
        </text>
      </svg>
      <div className="flow-legend">
        <span>
          <ArrowDownLeft size={15} color="#ad791c" /> Import
        </span>
        <span>
          <ArrowUpRight size={15} color="#548aa5" /> Eksport
        </span>
        <span>MW · {point ? timeLabel(point.start) : "—"}</span>
      </div>
      <p className="chart-footnote">
        Przepływy fizyczne, nie umowy handlowe. Schemat połączeń; brak odczytu nie oznacza zera.
      </p>
    </section>
  );
}
