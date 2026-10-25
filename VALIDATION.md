# Validation — 14 September 2026

## Executed successfully

- Native backend built with OCaml 5.5.0, Dune 3.24.2, Cohttp/Lwt 6.3.0, Yojson 3.0.0 and Ptime 1.2.0 in Ubuntu 24.04 WSL.
- `dune runtest`: 26 assertions passed. Coverage includes Warsaw's 92/96/100-interval days, canonical dates, explicit UTC serialization, revision selection, active hourly guidance, end-stamped PSE intervals, negative prices, missing measurements, signed border flows and generation accounting.
- `npm run check`: strict TypeScript, type-aware Oxlint with zero allowed warnings, Oxfmt verification, 9 Vitest tests, and the Vite production build passed.
- `npm run test:e2e`: 4 tests passed in Microsoft Edge against the actual OCaml API. Verified shared interval selection, tariff explanations, source dialog/keyboard dismissal, CSV download, mobile overflow, invalid dates and an explicit API-failure state.
- Separate browser check: selecting 13 September loads historical data; returning to today restores 14 September. Date labels and historical status matched.
- `start-local.ps1` successfully launched the API; `/api/health` reported the actual OCaml version as `5.5.0`.
- All four live upstream resources were successfully fetched: Energy-Charts generation/load, PSE physical flows, PSE RCE and PSE active guidance.
- At the 21:43 UTC source fetch, the selected day contained 96 normalized intervals, with 89 generation observations, 88 load observations, 92 complete border-flow observations, 96 RCE observations and 96 guidance intervals. These are a recorded validation snapshot, not a promise of ongoing completeness.
- Desktop (1440 px) and mobile (390 px) screenshots reviewed. Neither layout overflowed horizontally. Chart dimensions were adjusted after the initial mobile review so axis labels retain readable sizes.
- `docker compose config --quiet` passed.

## Scope and limitations

The application runs locally at http://127.0.0.1:5173 with its native OCaml API at http://127.0.0.1:8080. It has not been publicly deployed. Docker images and GitHub Actions are supplied but were not executed; Docker Engine was not running in this environment.

Successful retrieval does not imply a fresh observation. For example, the newest generation interval in the validation snapshot had no matching load observation. The dashboard correctly displayed a blank demand value rather than carrying another interval forward. Source data can be delayed or revised.

The local shortcut uses Node from the bundled Windows runtime and the isolated WSL opam root `/var/tmp/codex-prad-polski-build/opam-root`. The opam executable is in this task's `work/toolchain` directory. These are workspace conveniences; the standard README instructions recreate the application environment elsewhere.

Raw responses are cached and archived under the project data directory, with one API process per directory. The MVP has no authentication, payment processing, device control, tariff optimisation or private customer data. The supplied container configuration binds its web port to localhost by default.