# Prąd Polski

A working Polish electricity dashboard: an OCaml API and a React application. Public data is fetched from PSE and Fraunhofer ISE Energy-Charts. No fabricated live data or demo fallbacks are shipped.

![Desktop dashboard](docs/dashboard-desktop.png)

## Stack

Stable versions verified on 2026-09-14 and pinned:

- OCaml 5.5.0, Dune, Cohttp/Lwt, Yojson, Ptime
- React / React DOM 19.3.0
- Vite 8.3.0
- TypeScript 7.0.2
- Oxlint 1.83.0 with type-aware analysis
- Oxfmt 0.68.0
- Node 24+ (tested with 24.19.0)

The frontend lockfile is included. OCaml's compiler constraint is exact; library constraints and the opam lockfile control the backend environment.

## Included

- Live-source generation, demand, renewable production share, RCE price and physical border flows.
- One UTC interval selection shared by the KPI cards, generation/demand chart, prices, flows and fuel breakdown.
- Historical date selection from 2024-06-14; missing source coverage stays missing.
- PSE Energetyczny Kompas guidance.
- Deterministic daily summaries, explicitly scoped to available observations.
- Fixed, time-of-use, dynamic and PV tariff explanations. No savings claims or bill simulation.
- Source/methodology dialog, observation timestamps and source fetch timestamps.
- CSV export with UTC boundaries and unambiguous column units.
- Automatic five-minute refresh and backend background ingestion.
- Persistent, versioned raw JSON responses. A failed source can fall back only to an identified prior response for the same date.

## Run locally

### Backend (Linux, macOS, or Windows WSL)

Install opam and system build prerequisites. On Debian/Ubuntu, the relevant prerequisites are build-essential, curl, pkg-config, libgmp-dev and libev-dev.

From the backend directory:

```sh
opam switch create . ocaml-base-compiler.5.5.0
opam install . --deps-only --locked
opam exec -- dune build
opam exec -- dune runtest
opam exec -- dune exec bin/main.exe
```

Defaults: API on 127.0.0.1:8080, data in ../data. Optional environment settings: HOST, PORT, DATA_DIR. Create the parent of a custom DATA_DIR before starting. Run one API instance per data directory.

### Frontend

In the project root, with Node 24+:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies /api to the OCaml service. API_TARGET can override the backend origin. First source loading may take several seconds.

### Windows workspace shortcut

The working project is now `C:\Users\David\Documents\ChatGPT\Dashboard electricity`.
Run `./start-local.ps1` from PowerShell to launch the built OCaml executable in
Ubuntu-24.04 WSL and Vite on Windows, without opening extra windows. Logs and
process IDs stay in `.local-run/`. The script resolves paths relative to itself,
verifies both HTTP endpoints and managed process paths, and fails if startup is
unsuccessful or an existing service belongs to another/unmanaged checkout.

The launcher uses the bundled Node runtime; `NODE_BIN` can select another Node
24+ executable. `-Distribution` selects a different WSL distribution, but the
backend must first be built for that distribution. Run `npm ci` on Windows and
build the backend using the instructions above for a fresh checkout. Do not
share `node_modules` between Windows and Linux.

The original recovered code is preserved in Git commit `7588c3d`. The separate
WSL copy at `/home/david/workspace/prad-polski` was compared: its application
source matches the recovered baseline, with differences only in launch/setup
files. This folder is the active development copy. See
[the review](docs/review-2026-10-25.md) and [architecture report](docs/architecture-review.html).

## Checks

```sh
npm run check
cd backend
opam exec -- dune runtest
```

npm run check runs TypeScript, type-aware Oxlint, Oxfmt verification, Vitest and the production frontend build. Browser tests require both servers to be running:

```sh
npm run test:e2e
```

The default browser is installed Microsoft Edge on Windows; set PLAYWRIGHT_CHANNEL=chromium and install Chromium with npx playwright install chromium on Linux. The live integration tests depend on public upstream services. Semantic unit tests do not.

TypeScript enables strict mode, checked indexed access, exact optional properties, no implicit overrides, no switch fallthrough, unused checks, explicit module syntax and side-effect import checking. The JSX prefer-tag-over-role lint rule is disabled because interactive inline SVG charts correctly use role=img; a raster img element cannot replace them.

## Container deployment

With Docker Engine running:

```sh
docker compose up --build
```

Then open http://127.0.0.1:8088. Nginx serves the Vite production build and proxies /api to the native OCaml process. The named energy-data volume persists source responses. The API is not directly published.

Container configuration is supplied separately from the verified local WSL build; see VALIDATION.md for what was actually executed. Public hosting requires a container host or VM, TLS and review of upstream redistribution terms. A native OCaml API cannot run directly in the Sites Cloudflare Worker runtime.

## API

GET /api/health reports service status and the actual OCaml runtime version.

GET /api/v1/day?date=YYYY-MM-DD returns:

- schemaVersion, date, timezone and generatedAt;
- sources with names, public URLs, exact endpoints, last successful retrieval and error state;
- 92, 96 or 100 UTC quarter-hour slots with nullable measurements.

Unsupported methods return 405. Invalid/out-of-range dates return 400. Source failures are represented per-source, with null fields where no cached data exists. A healthy HTTP response is not a claim that upstream measurements are fresh.

## Source semantics

Generation: https://api.energy-charts.info/public_power?country=pl

Detailed reported production and load, based on ENTSO-E. Imports, pumping consumption, residual load and percentage series are excluded from generation totals. Pumped-storage discharge is displayed separately and excluded from the renewable numerator. Gas includes coal-derived gas; other includes oil, other generation and other renewables. Unknown or missing required fuel data is not replaced with zero.

Physical flows: https://api.raporty.pse.pl/api/przeplywy-mocy

PSE returns both XX-PL (incoming positive) and PL-XX (outgoing negative). Both rows are required for each country's net result; e.g. simultaneous Czech inflow and outflow can occur on different lines. The map displays net physical flow per border. The national net is available only if all six borders have complete data. This is not commercial exchange or the origin of imported generation.

Price: https://api.raporty.pse.pl/api/rce-pln

RCE in PLN/MWh, not a household price and not a substitute for a supplier's contract-specific fixing. No currency conversion, retail taxes or charges are silently added.

Guidance: https://api.raporty.pse.pl/api/pdgsz

Only active records are used. Values 0–3 retain PSE's own meaning. Guidance is an hourly forecast, separate from market prices.

PSE price/flow dtime_utc marks the end of the quarter-hour. Energy-Charts timestamps and PSE guidance mark interval starts. Pagination uses a verified page size of 500 and follows nextLink with an origin allowlist and a bounded number of pages. The full pagination sequence must succeed before the cache is replaced.

## Deliberate MVP limits

- File-based raw archive, not PostgreSQL. Suitable for one service instance; no shared multi-instance locking.
- Historical data is fetched on demand. Today and yesterday have a five-minute cache TTL so late publications can arrive after midnight; older dates use six hours. Background ingestion refreshes today. No claim of complete long-term backfill.
- Cache revisions are retained without automatic deletion; operators should budget storage and configure archival retention for production.
- No direct ENTSO-E token integration, carbon-intensity estimate, causal explanation, forecasting model, tariff optimiser, accounts, notifications or device control.
- The data panel exposes provenance and timestamps, not a numerical confidence score.
- The UI never labels a wholesale dip as guaranteed household savings.
- Google Fonts is requested for typography; system fonts remain usable offline.
- Data availability and redistribution rights are separate. Source attribution is included; production reuse terms still need review.

## Data attribution

Polskie Sieci Elektroenergetyczne: https://www.pse.pl/dane-systemowe

Fraunhofer ISE Energy-Charts: https://www.energy-charts.info/

Underlying European generation data: https://transparency.entsoe.eu/

This is an independent project and is not endorsed by these organisations.
