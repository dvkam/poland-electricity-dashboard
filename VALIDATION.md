# Validation — 25 October 2026

## Hourly history and publication preparation

- Energy-Charts v2 supplies explicit 15-minute or 60-minute duration. The backend
  preserves source boundaries and never infers duration from timestamp gaps.
- A live request for 14 June 2024 returned 24 hourly averages covering all 96
  dashboard quarters. The first four share the source interval 22:00 to 23:00 UTC
  on 13 June, with generation of 15699.4 MW.
- Backend regressions pass for hourly coverage, missing hours, quarter-hour gaps,
  unsupported duration, both DST transitions and same-time snapshot revisions.
- `npm run check` passes, including 12 unit tests and the production build.
- All 14 browser tests pass, including hourly source labels and mobile layout.
- A scan of all existing commits found no common GitHub token, OpenAI key or
  private-key patterns. Raw data, local logs and dependencies are ignored.
- The public README describes setup, repository layout, APIs, storage and limits.

## Relocation and review iteration

The active project is `C:\Users\David\Documents\ChatGPT\Dashboard electricity`.
Recovered baseline: `7588c3d`. Implementation commits: `910a13b` (portable local
startup), `f45f364` (cache/guidance), `abf445d` (time selection and evidence).
The subsequent ownership correction prevents the launcher from silently reusing
an unrelated app or another checkout. The separate WSL reference copy was not edited.

Executed successfully against this project:

- `npm run check`: strict TypeScript, type-aware Oxlint, Oxfmt, **12 unit tests**,
  and the production build.
- `npm run test:e2e`: **13 browser tests** in installed Microsoft Edge. UI tests
  use deterministic fixtures; the live integration test uses the real OCaml API.
  Coverage includes 92/96/100-quarter days, repeated-hour offsets, midnight
  rollover versus deliberate history, failed date-change isolation, tariff copy,
  synchronized selection, source dialog, CSV download, invalid API dates,
  layout overflow at 320/390/768/1440 pixels, report links and keyboard focus.
- `dune build` and `dune runtest`: **33 backend assertions**, including yesterday's
  cache policy through both DST changes and rejection of fractional guidance codes.
- `tests/verify-startup.ps1`: **3 startup checks**, confirming reuse of the same
  managed processes and refusal when either ownership record is unavailable.
- Actual backend working directory and executable resolved inside this project.
  Restarted the rebuilt backend after tests; API health and Vite proxy responded.
- Desktop and mobile live screenshots inspected. The new 320-pixel regression
  initially failed because date controls overflowed; it passed after the layout fix.
- Architecture report opened in the in-app browser, screenshots inspected at
  desktop/mobile widths; local source links and visible keyboard focus verified.

Live snapshot for 25 October: **100 intervals**, **100 RCE values**, **8 complete
border-flow intervals**, and **no generation observations** at the check. PSE
prices, flows and guidance fetched successfully; Energy-Charts generation was
unavailable/unpublished. This limitation is visible as blanks and a source warning,
not synthetic data. Counts are a snapshot, not an ongoing completeness guarantee.

The original product/build discussions and all application source were reviewed
using the requested Pocock, pstack and Emil guidance. Independent standards and
spec reviews both identified the launcher ownership issue; it was fixed and
re-reviewed with no further blocking finding. See `docs/review-2026-10-25.md` and
`docs/architecture-review.html` for deferred issues and design rationale.

Not executed: public deployment, Docker build/run, GitHub Actions on a remote
runner, Safari/Firefox, or real physical-device touch testing. There is no remote
configured and no commits were pushed.

# Historical validation — 14 September 2026

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
