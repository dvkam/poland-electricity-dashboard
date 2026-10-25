import { useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  Leaf,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Sun,
  Zap,
} from "lucide-react";
import { Evidence } from "./Evidence";
import { FlowMap } from "./FlowMap";
import { Timeline } from "./Timeline";
import { PriceChart } from "./PriceChart";
import { useDay } from "./useDay";
import { useDashboardDay } from "./useDashboardDay";
import {
  dateLabel,
  fullTime,
  intervalLabel,
  generationIntervalLabel,
  fuels,
  latestIndex,
  numberLabel,
  observationState,
  renewableEnergyShare,
  shiftDate,
  tariffCopy,
  timeLabel,
  today,
} from "./data";
import type { Day, Point, SourceId, Tariff } from "./data";

function downloadCsv(day: Day) {
  const headings = [
    "start_utc",
    "end_utc",
    "generation_start_utc",
    "generation_end_utc",
    "generation_mw",
    "demand_mw",
    "renewable_percent",
    "net_physical_import_mw",
    "rce_pln_mwh",
  ];
  const rows = day.points.map((p) =>
    [
      p.start,
      p.end,
      p.generationStart,
      p.generationEnd,
      p.generationMw,
      p.demandMw,
      p.renewablePercent,
      p.netImportMw,
      p.rcePlnMwh,
    ]
      .map((value) => value ?? "")
      .join(","),
  );
  const blob = new Blob([headings.join(",") + "\n" + rows.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "prad-polski-" + day.date + ".csv";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Stat({
  title,
  value,
  unit,
  detail,
  icon,
  accent,
  onClick,
}: {
  title: string;
  value: string;
  unit: string;
  detail: string;
  icon: React.ReactNode;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`stat panel ${accent ? "stat-renewable" : ""}`}
      onClick={onClick}
    >
      <span className="stat-heading">
        {title}
        <span className="stat-icon">{icon}</span>
      </span>
      <span className="stat-value">
        {value}
        <small>{unit}</small>
      </span>
      <span className="stat-detail">
        {detail}
        <ArrowUpRight size={14} />
      </span>
    </button>
  );
}
function Mix({ point }: { point: Point | undefined }) {
  return (
    <section className="panel mix-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">WYBRANY KWADRANS</span>
          <h2>Produkcja w szczegółach</h2>
        </div>
        <span className="small-tag">{point ? timeLabel(point.start) : "—"}</span>
      </div>
      <div className="mix-list">
        {fuels.map((fuel) => {
          const value = point?.generation[fuel.key] ?? null;
          const share =
            value !== null && point?.generationMw ? (value / point.generationMw) * 100 : null;
          return (
            <div className="mix-row" key={fuel.key}>
              <span className="mix-label">
                <i style={{ background: fuel.color }} />
                {fuel.label}
              </span>
              <div className="mix-track">
                <span style={{ width: (share ?? 0) + "%", background: fuel.color }} />
              </div>
              <b>
                {numberLabel(value === null ? null : value / 1000, 2)} <small>GW</small>
              </b>
              <span className="mix-percent">{numberLabel(share, 1)}%</span>
            </div>
          );
        })}
      </div>
      <p className="chart-footnote">
        Magazyny: produkcja elektrowni szczytowo-pompowych i baterii. Pobór na pompowanie:{" "}
        {numberLabel(point?.pumpingMw ?? null, 0)} MW.
      </p>
    </section>
  );
}
function Stories({ day }: { day: Day }) {
  const complete = day.points.filter(
    (point) => point.generationMw !== null && Date.parse(point.end) <= Date.parse(day.generatedAt),
  );
  const solarPeak = complete.reduce<Point | undefined>(
    (best, point) =>
      (point.generation.solar ?? -1) > (best?.generation.solar ?? -1) ? point : best,
    undefined,
  );
  const prices = day.points.filter((point) => point.rcePlnMwh !== null);
  const cheapest = prices.reduce<Point | undefined>(
    (best, point) => ((point.rcePlnMwh ?? Infinity) < (best?.rcePlnMwh ?? Infinity) ? point : best),
    undefined,
  );
  const share = renewableEnergyShare(complete);
  return (
    <section className="stories-section" aria-labelledby="stories-heading">
      <div className="section-title">
        <h2 id="stories-heading">Ten dzień w trzech zdaniach</h2>
        <span>Z dostępnych danych · bez zgadywania przyczyn</span>
      </div>
      <div className="stories-grid">
        <article className="story">
          <span className="story-icon solar">
            <Sun size={20} />
          </span>
          <span className="story-kicker">SŁONECZNE MAKSIMUM</span>
          <h3>
            {solarPeak
              ? numberLabel((solarPeak.generation.solar ?? 0) / 1000, 2) + " GW ze słońca"
              : "Czekamy na pomiary"}
          </h3>
          <p>
            {solarPeak
              ? "Najwyższa raportowana moc PV o " +
                timeLabel(solarPeak.start) +
                ". To maksimum w dostępnych pomiarach tego dnia."
              : "Nie ma jeszcze danych, z których można wyznaczyć maksimum."}
          </p>
        </article>
        <article className="story">
          <span className="story-icon green">
            <Leaf size={20} />
          </span>
          <span className="story-kicker">UDZIAŁ ODNAWIALNYCH</span>
          <h3>
            {share === null ? "Niepełny obraz dnia" : numberLabel(share, 1) + "% produkcji z OZE"}
          </h3>
          <p>
            Udział ważony energią z {complete.length} dostępnych kwadransów. Dzisiejsze dane mogą
            być niepełne i podlegać korektom.
          </p>
        </article>
        <article className="story">
          <span className="story-icon rose">
            <Zap size={20} />
          </span>
          <span className="story-kicker">MINIMUM RYNKOWE</span>
          <h3>{cheapest ? numberLabel(cheapest.rcePlnMwh, 2) + " zł/MWh" : "Czekamy na ceny"}</h3>
          <p>
            {cheapest
              ? "Najniższe opublikowane RCE o " +
                timeLabel(cheapest.start) +
                ". Wpływ na rachunek zależy od Twojej umowy."
              : "Najniższa cena pojawi się po publikacji danych PSE."}
          </p>
        </article>
      </div>
    </section>
  );
}
function TariffCard() {
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const copy = tariff ? tariffCopy[tariff] : null;
  const choices: { key: Tariff; label: string }[] = [
    { key: "G11", label: "Stała · G11" },
    { key: "G12", label: "Strefowa · G12/G13" },
    { key: "dynamic", label: "Dynamiczna" },
    { key: "PV", label: "Mam fotowoltaikę" },
  ];
  return (
    <section className="panel tariff-panel" aria-labelledby="tariff-heading">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">A CO Z MOIM RACHUNKIEM?</span>
          <h2 id="tariff-heading">Rynek to nie Twoja faktura.</h2>
        </div>
        <span className="tariff-icon">
          <PlugZap size={25} />
        </span>
      </div>
      <p className="tariff-intro">
        Wybierz swoją sytuację i sprawdź, co te liczby oznaczają dla Ciebie.
      </p>
      <div className="tariff-choices" aria-label="Rodzaj taryfy">
        {choices.map((choice) => (
          <button
            type="button"
            key={choice.key}
            aria-pressed={tariff === choice.key}
            onClick={() => setTariff(choice.key)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <div className="tariff-explanation" aria-live="polite">
        <h3>{copy?.title ?? "Niska cena rynkowa nie zawsze oznacza tańszy prąd w domu."}</h3>
        <p>
          {copy?.text ??
            "RCE opisuje rynek. O tym, ile płacisz, decydują warunki Twojej umowy, dystrybucja, opłaty i podatki. Nie musisz znać wszystkich pojęć — zacznij od swojej taryfy."}
        </p>
        <span>
          <CircleHelp size={16} />
          {copy?.note ?? "Nazwę taryfy znajdziesz na fakturze za energię."}
        </span>
      </div>
    </section>
  );
}
function Guidance({ point }: { point: Point | undefined }) {
  const advice = point?.guidance;
  const labels = [
    "Zalecane korzystanie",
    "Zwykłe korzystanie",
    "Zalecane oszczędzanie",
    "Wymagane ograniczenie",
  ];
  return (
    <div className={`guidance guidance-${advice ?? "unknown"}`}>
      <ShieldCheck size={22} />
      <div>
        <b>
          {advice === null || advice === undefined
            ? "Brak wskazania Kompasu dla tego okresu"
            : labels[advice]}
        </b>
        <span>Energetyczny Kompas PSE · wskazanie dla systemu, nie obietnica oszczędności</span>
      </div>
      <a
        href="https://www.energetycznykompas.pl/"
        target="_blank"
        rel="noreferrer"
        aria-label="Otwórz Energetyczny Kompas PSE"
      >
        <ArrowUpRight size={20} />
      </a>
    </div>
  );
}
export function App() {
  const { date, now, selectDate } = useDashboardDay();
  const [selection, setSelection] = useState<{ date: string; index: number } | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [sourceFocus, setSourceFocus] = useState<SourceId | null>(null);
  const { data, error, loading, refresh } = useDay(date);
  const latest = data ? latestIndex(data.points, now) : null;
  const selected = data
    ? Math.min(
        (selection?.date === date ? selection.index : null) ?? latest ?? 0,
        data.points.length - 1,
      )
    : 0;
  const point = data?.points[selected];
  const latestPoint = latest === null ? undefined : data?.points[latest];
  const status = observationState(latestPoint, date, now);
  const selectInterval = (index: number) => setSelection({ date, index });
  function changeDate(value: string) {
    if (!value || value < "2024-06-14" || value > today()) return;
    selectDate(value);
    setSelection(null);
  }
  function evidence(id: SourceId | null = null) {
    setSourceFocus(id);
    setEvidenceOpen(true);
  }
  const sourceIssues = data?.sources.filter((source) => source.error);
  return (
    <>
      <a className="skip-link" href="#main">
        Przejdź do treści
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="Prąd Polski — strona główna">
            <span className="brand-mark">
              <Zap size={25} strokeWidth={2.5} />
            </span>
            <span>
              prąd<span className="brand-period">.</span>
              <small>POLSKI</small>
            </span>
          </a>
          <nav aria-label="Nawigacja główna">
            <a className="nav-active" href="#main">
              Przegląd
            </a>
            <a href="#stories-heading">Dzisiaj w energetyce</a>
            <button type="button" onClick={() => evidence()}>
              Dane i metodologia <ArrowUpRight size={14} />
            </button>
          </nav>
          <span className="header-country">
            <span className="flag-pl" /> Polska
          </span>
        </div>
      </header>
      <main id="main" className="main">
        <div className="page-heading">
          <div>
            <div className="breadcrumb">
              POLSKA <span>/</span> SYSTEM ELEKTROENERGETYCZNY
            </div>
            <h1>
              Energia w Polsce<span className="title-period">.</span>
            </h1>
            <p>Produkcja, przepływy i ceny. Zobacz, co dzieje się w naszej sieci.</p>
          </div>
          <div className="date-controls">
            <div className="date-picker">
              <button
                type="button"
                className="icon-button"
                disabled={date <= "2024-06-14"}
                onClick={() => changeDate(shiftDate(date, -1))}
                aria-label="Poprzedni dzień"
              >
                <ChevronLeft size={18} />
              </button>
              <CalendarDays size={17} />
              <label className="sr-only" htmlFor="selected-date">
                Dzień danych
              </label>
              <input
                id="selected-date"
                type="date"
                min="2024-06-14"
                max={today()}
                value={date}
                onChange={(event) => changeDate(event.target.value)}
              />
              <button
                type="button"
                className="icon-button"
                disabled={date >= today()}
                onClick={() => changeDate(shiftDate(date, 1))}
                aria-label="Następny dzień"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <button
              type="button"
              className="today-button"
              onClick={() => {
                changeDate(today());
                setSelection(null);
              }}
            >
              Dzisiaj
            </button>
          </div>
        </div>
        <div className="status-strip">
          <div>
            <span
              className={`status-dot ${status === "Dane opóźnione" ? "delayed" : status === "Brak pomiaru" ? "missing" : ""}`}
            />
            <span>{loading && !data ? "Pobieranie danych ze źródeł" : status}</span>
            {latestPoint && (
              <span className="muted" title={fullTime(latestPoint.end)}>
                · {generationIntervalLabel(latestPoint)}
              </span>
            )}
          </div>
          <button type="button" className="refresh-button" disabled={loading} onClick={refresh}>
            <RefreshCw size={14} className={loading ? "spin" : ""} />
            {loading ? "Odświeżanie…" : "Odśwież"}
            <span>co 5 min</span>
          </button>
        </div>
        {error && (
          <div className="error-banner" role="alert">
            <b>Nie udało się odświeżyć danych.</b> {error}
            {data && " Widoczny jest poprzedni zapis dla tego dnia."}
            <button type="button" onClick={refresh}>
              Spróbuj ponownie <ArrowRight size={15} />
            </button>
          </div>
        )}
        {sourceIssues && sourceIssues.length > 0 && (
          <div className="warning-banner" role="status">
            {sourceIssues.length} z 4 źródeł zgłasza problem pobierania lub zapisu. Brakujące
            pomiary pozostają puste.
            <button type="button" onClick={() => evidence()}>
              Sprawdź źródła <ArrowUpRight size={14} />
            </button>
          </div>
        )}
        {!data && loading && (
          <div className="loading-state" role="status">
            <span className="loading-orbit">
              <Zap size={32} />
            </span>
            <h2>Łączymy dane polskiej energetyki</h2>
            <p>Pobieramy produkcję, ceny i przepływy z ich źródeł.</p>
            <span>Przy pierwszym otwarciu może to potrwać kilkadziesiąt sekund.</span>
          </div>
        )}
        {data && (
          <>
            <div className="snapshot-heading">
              <span>
                WYBRANY ODCZYT <b>{point ? intervalLabel(point) : "—"}</b>
                <span className="snapshot-date">{dateLabel(date)}</span>
              </span>
              <button
                type="button"
                className="text-link"
                disabled={latest === null}
                onClick={() => setSelection(null)}
              >
                Ostatni pomiar <ArrowRight size={14} />
              </button>
            </div>
            <div className="stats-grid">
              <Stat
                title="Zapotrzebowanie"
                value={numberLabel(
                  point?.demandMw === null || point?.demandMw === undefined
                    ? null
                    : point.demandMw / 1000,
                  2,
                )}
                unit="GW"
                detail="Moc pobierana z systemu"
                icon={<Activity size={19} />}
                onClick={() => evidence("generation")}
              />
              <Stat
                title="Krajowa produkcja"
                value={numberLabel(
                  point?.generationMw === null || point?.generationMw === undefined
                    ? null
                    : point.generationMw / 1000,
                  2,
                )}
                unit="GW"
                detail="Suma raportowanych źródeł"
                icon={<Zap size={19} />}
                onClick={() => evidence("generation")}
              />
              <Stat
                title="Udział OZE"
                value={numberLabel(point?.renewablePercent ?? null, 1)}
                unit="%"
                detail="W krajowej produkcji"
                icon={<Leaf size={19} />}
                accent
                onClick={() => evidence("generation")}
              />
              <Stat
                title="Rynkowa cena energii"
                value={numberLabel(point?.rcePlnMwh ?? null, 2)}
                unit="zł/MWh"
                detail="RCE · nie cena na rachunku"
                icon={<span className="currency-icon">zł</span>}
                onClick={() => evidence("prices")}
              />
            </div>
            <div className="primary-grid">
              <Timeline day={data} selected={selected} onSelect={selectInterval} />
              <FlowMap point={point} onEvidence={() => evidence("flows")} />
            </div>
            <Guidance point={point} />
            <Stories day={data} />
            <div className="secondary-grid">
              <PriceChart
                day={data}
                selected={selected}
                onSelect={selectInterval}
                onEvidence={() => evidence("prices")}
              />
              <TariffCard />
            </div>
            <Mix point={point} />
            <div className="data-bar">
              <div>
                <Database size={19} />
                <span>
                  <b>Otwarte źródła. Czytelne zasady.</b>
                  <small>PSE · Energy-Charts / Fraunhofer ISE · ENTSO-E</small>
                </span>
              </div>
              <button type="button" className="secondary-button" onClick={() => downloadCsv(data)}>
                <ArrowDownToLine size={16} /> Pobierz CSV
              </button>
              <button type="button" className="text-link" onClick={() => evidence()}>
                Sprawdź metodologię <ArrowUpRight size={15} />
              </button>
            </div>
          </>
        )}
      </main>
      <footer className="footer">
        <span>
          <b>prąd.</b> Polski system, zrozumiale.
        </span>
        <span>Niezależny projekt · Dane wstępne · Czas: Europe/Warsaw</span>
      </footer>
      <Evidence
        open={evidenceOpen}
        focus={sourceFocus}
        day={data}
        point={point}
        onClose={() => setEvidenceOpen(false)}
      />
    </>
  );
}
