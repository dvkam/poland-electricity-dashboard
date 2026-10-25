# Generation availability investigation

Follow-up: hourly support is now implemented using Energy-Charts v2's explicit
`interval_minutes`. Generation source boundaries survive quarter-hour alignment
in the API, UI labels and CSV. The hourly limitation described below records the
state at the time of this investigation. It has been resolved. Snapshots now use
exclusive unique filenames to preserve revisions fetched within the same second.

## Evidence and diagnosis

On 25 October 2026, the earlier generic generation error had disappeared without
an application change. At 00:58 UTC, a direct Energy-Charts request and the local
API both contained three observations for the Warsaw day: 22:00, 22:15 and 22:30
UTC on the previous date. Generation was respectively 14706.7, 14729.5 and
14816.5 MW. This supports delayed upstream publication or a transient upstream
failure. The earlier HTTP response was not retained, so the exact cause cannot
be established retrospectively. Missing future intervals remain null.

The query uses `start=2026-10-25&end=2026-10-25`. According to the provider's
documentation, date-only bounds cover the local calendar day; equal dates are
valid. Source timestamps mark the beginning of each interval.

## Corrections

- Preserve HTTP status, distinguish invalid JSON, incompatible responses and
  empty publication, and log failures with their requested URL.
- Keep fresh downloaded data when saving the local JSON fails. Previously the
  broad catch discarded it and misleadingly reported an upstream failure.
- Include the provider's Battery series in storage and total generation, but
  exclude Battery Consumption and battery discharge from renewable generation.
  Older responses without a Battery series remain compatible; explicit nulls
  remain unknown. Battery values in today's inspected response were zero, so
  this omission did not cause the reported outage.
- Update storage explanations and the source-warning banner.

## Historical data and persistence

Official API documentation: https://api.energy-charts.info/

Direct requests returned 96 quarter-hour observations for 24 October 2026 and
14 September 2026, and 24 hourly observations for 14 June 2024 and 15 January 2020. This is evidence of accessible history, not a guarantee of the earliest
available date, retention, or equal coverage across Energy-Charts and PSE.

No database is required to request history. The existing per-source/day JSON
cache and timestamped snapshots already support local persistence. A database
becomes useful for indexed multi-year queries, larger backfills, or concurrent
writers. Keep raw responses as provenance if adding normalized SQLite or
PostgreSQL tables. Own snapshots are necessary to reproduce what was known at
an earlier time rather than today's revised historical response.

Limitations: the current dashboard aligns exact source timestamps to 15-minute
slots. Hourly historical input is not yet supported correctly as hourly averages;
do not use that rendering for historical energy totals or interpret the missing
quarters as zero. A follow-up should carry explicit source interval duration
through the API/UI before extending historical analysis. Snapshot retention is
currently unbounded. Failed fetches are not negatively cached; production
backfills need provider-aware throttling and HTTP 429 Retry-After handling.

## Regression validation

Backend tests cover HTTP errors, invalid JSON, empty/malformed envelopes, cache
write failures, battery generation and null semantics. The existing no-battery
fixture verifies backward compatibility. Tests use synthetic payloads and do
not depend on the provider being available.
