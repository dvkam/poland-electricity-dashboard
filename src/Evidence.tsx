import { useEffect, useRef } from "react";
import { ArrowUpRight, Database, X } from "lucide-react";
import { fullTime } from "./data";
import type { Day, SourceId } from "./data";
export function Evidence({
  open,
  focus,
  day,
  onClose,
}: {
  open: boolean;
  focus: SourceId | null;
  day: Day | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) element.showModal();
    else if (!open && element?.open) element.close();
  }, [open]);
  return (
    <dialog
      className="evidence-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="evidence-title"
    >
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">ZA KAŻDĄ LICZBĄ JEST ŹRÓDŁO</span>
          <h2 id="evidence-title">Dane i metodologia</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Zamknij panel źródeł"
        >
          <X size={22} />
        </button>
      </div>
      <div className="dialog-content">
        <p className="dialog-intro">
          Pomiary są wstępne i mogą być korygowane. Pokazujemy przedziały czasu w Polsce, zachowując
          znaczniki UTC. Dane z różnych źródeł mogą pojawiać się w różnym czasie.
        </p>
        {day?.sources.map((source) => (
          <article
            key={source.id}
            className={`source-card ${focus === source.id ? "source-highlight" : ""}`}
          >
            <div className="source-title">
              <Database size={18} />
              <h3>{source.name}</h3>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                aria-label={`Otwórz źródło: ${source.name}`}
              >
                <ArrowUpRight size={18} />
              </a>
            </div>
            <p>{source.note}</p>
            <dl>
              <div>
                <dt>Ostatnie skuteczne pobranie</dt>
                <dd>{source.fetchedAt ? fullTime(source.fetchedAt) : "Brak udanego pobrania"}</dd>
              </div>
              <div>
                <dt>Sposób dostarczenia</dt>
                <dd>
                  {source.error
                    ? "Źródło niedostępne / zapis archiwalny"
                    : source.cached
                      ? "Zapis w pamięci podręcznej"
                      : "Odpowiedź źródła"}
                </dd>
              </div>
            </dl>
            {source.error && <p className="source-error">{source.error}</p>}
            <a
              className="text-link source-endpoint"
              href={source.endpoint}
              target="_blank"
              rel="noreferrer"
            >
              Zobacz odpowiedź API <ArrowUpRight size={13} />
            </a>
          </article>
        ))}
        {!day && <p>Informacje o pobraniach pojawią się po załadowaniu dnia.</p>}
        <div className="methodology">
          <h3>Jak czytać dashboard</h3>
          <p>
            <b>Produkcja a zużycie.</b> Miks opisuje raportowaną krajową produkcję, a nie
            pochodzenie energii w Twoim gniazdku. Zapotrzebowanie jest oddzielnym szeregiem. Nie
            wymuszamy równości pomiędzy seriami o różnych definicjach.
          </p>
          <p>
            <b>OZE.</b> Sumujemy wiatr, słońce, naturalną hydroenergetykę, biomasę i inne
            raportowane odnawialne źródła. Dzielimy przez sumę raportowanej produkcji. Produkcja
            elektrowni szczytowo-pompowych nie jest automatycznie odnawialna.
          </p>
          <p>
            <b>Granice.</b> Saldo to suma sześciu fizycznych przekrojów PSE dla tego samego
            kwadransa. Jeśli brakuje jednego odczytu, saldo pozostaje nieznane. Importu nie
            traktujemy jako oceny jakości ani bezpieczeństwa sieci.
          </p>
          <p>
            <b>Czas.</b> Każdy kwadrans ma osobny początek i koniec w UTC. Doba w strefie
            Europe/Warsaw może mieć 92, 96 lub 100 kwadransów. Czas raportu PSE dla cen i przepływów
            oznacza koniec przedziału.
          </p>
          <p>
            <b>Aktualność.</b> „Dane opóźnione” oznaczają, że ostatni dostępny pomiar produkcji
            zakończył się ponad godzinę temu. Świeże pobranie może zawierać stary pomiar. Dzisiejsze
            podsumowanie obejmuje tylko dostępne pomiary.
          </p>
          <p>
            <b>Cena.</b> PLN/MWh ÷ 1000 = PLN/kWh, ale ta konwersja nie dodaje dystrybucji, opłat
            ani podatków. Nie wyliczamy oszczędności z samego RCE.
          </p>
          <p>
            <b>Publikacje.</b> Podsumowania powstają z reguł i obliczeń, bez generowania faktów
            przez AI. Nie stwierdzają przyczyn zmian. Zachowujemy lokalne kopie odpowiedzi źródeł
            wraz z czasem pobrania.
          </p>
          <p>
            <b>Uznanie autorstwa.</b> Dane produkcji: Fraunhofer ISE, Energy-Charts, na podstawie
            ENTSO-E. Ceny, przepływy i wskazania Kompasu: Polskie Sieci Elektroenergetyczne. Serwis
            niezależny, nie jest oficjalną aplikacją tych organizacji.
          </p>
        </div>
      </div>
    </dialog>
  );
}
