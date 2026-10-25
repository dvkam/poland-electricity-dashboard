open Grid
let check name condition = if not condition then failwith name else Printf.printf "PASS %s\n%!" name
let get name = Normalize.field name
let num = Normalize.number
let empty = `Assoc ["value", `List []]
let () =
  check "normal Warsaw day has 96 quarter-hours" (List.length (Time.slots "2026-09-14") = 96);
  check "spring DST has 92 quarter-hours" (List.length (Time.slots "2026-03-29") = 92);
  check "autumn DST has 100 quarter-hours" (List.length (Time.slots "2026-10-25") = 100);
  check "invalid calendar dates rejected" (Time.date_parts "2026-02-30" = None);
  check "invalid date syntax rejected" (Time.date_parts "2026-9-014" = None);
  check "noncanonical numeric date rejected" (Time.date_parts "2026-+9-14" = None);
  let summer = Option.get (Time.bounds "2026-09-14") |> fst in
  check "Warsaw midnight stored as preceding UTC date" (Time.iso summer = "2026-09-13T22:00:00Z");
  let autumn = Time.slots "2026-10-25" in
  check "autumn UTC timestamps remain unique" (List.length (List.sort_uniq Float.compare autumn) = 100);
  check "UTC timestamp parsing without seconds" (Time.parse_utc "2026-09-13 22:00" = Some summer);
  check "null never becomes zero" (Normalize.sum [Some 4.; None] = None);
  let imported = Normalize.flow_json "DE" (Some (`Assoc ["value", `Float 500.])) in
  check "positive PSE physical flow is import" (get "from" imported = `String "DE" && get "to" imported = `String "PL");
  let exported = Normalize.flow_json "CZ" (Some (`Assoc ["value", `Float (-300.)])) in
  check "negative PSE physical flow is export" (get "from" exported = `String "PL" && get "to" exported = `String "CZ" && num (get "mw" exported) = Some 300.);
  let price = `Assoc ["value", `List [`Assoc ["dtime_utc", `String "2026-09-13 22:15:00"; "rce_pln", `Float (-42.5); "publication_ts_utc", `String "2026-09-13 12:00:00"]]] in
  let points = Normalize.day ~date:"2026-09-14" ~power:`Null ~flows:empty ~prices:price ~guidance:empty in
  let first = List.hd points in
  check "end-stamped PSE price aligns with start of quarter-hour" (num (get "rcePlnMwh" first) = Some (-42.5));
  check "negative prices are preserved" (num (get "rcePlnMwh" first) = Some (-42.5));
  check "missing generation stays null" (get "generationMw" first = `Null);
  check "incomplete border coverage has no net figure" (get "netImportMw" first = `Null);
  let advice active value published = `Assoc [
    "dtime_utc", `String "2026-09-13 22:00"; "is_active", `Bool active;
    "usage_fcst", `Int value; "publication_ts_utc", `String published] in
  let guidance = `Assoc ["value", `List [advice false 3 "2026-09-13 21:00"; advice true 1 "2026-09-13 20:00"]] in
  let advised = Normalize.day ~date:"2026-09-14" ~power:`Null ~flows:empty ~prices:empty ~guidance in
  check "inactive guidance revisions excluded" (get "guidance" (List.hd advised) = `Int 1);
  check "hourly guidance not carried into next hour" (get "guidance" (List.nth advised 4) = `Null);
  let revised = `Assoc ["value", `List [
    `Assoc ["dtime_utc", `String "2026-09-13 22:15"; "rce_pln", `Float 10.; "publication_ts_utc", `String "2026-09-13 12:00"];
    `Assoc ["dtime_utc", `String "2026-09-13 22:15"; "rce_pln", `Float 20.; "publication_ts_utc", `String "2026-09-13 13:00"]]] in
  let revision = Normalize.day ~date:"2026-09-14" ~power:`Null ~flows:empty ~prices:revised ~guidance:empty |> List.hd in
  check "newest publication revision wins" (num (get "rcePlnMwh" revision) = Some 20.)


let () =
  let flow section value = `Assoc ["section_code", `String section; "value", `Float value;
    "dtime_utc", `String "2026-09-13 22:15"; "publication_ts_utc", `String "2026-09-14 21:18:12"] in
  let observed = [flow "CZ-PL" 28.3; flow "PL-CZ" (-744.); flow "DE-PL" 699.4; flow "PL-DE" 0.;
    flow "LT-PL" 0.; flow "PL-LT" (-169.3); flow "SE-PL" 447.5; flow "PL-SE" 0.;
    flow "SK-PL" 0.; flow "PL-SK" (-140.6); flow "UA-PL" 133.7; flow "PL-UA" 0.] in
  let first flows = Normalize.day ~date:"2026-09-14" ~power:`Null
    ~flows:(`Assoc ["value", `List flows]) ~prices:empty ~guidance:empty |> List.hd in
  let point = first observed in
  check "observed PSE incoming and outgoing rows are combined" (
    match num (get "netImportMw" point) with Some n -> abs_float (n -. 255.) < 0.001 | None -> false);
  let czech = Normalize.list (get "flows" point) |> List.find (fun flow -> get "country" flow = `String "CZ") in
  check "opposite physical flows produce the correct net arrow" (
    get "from" czech = `String "PL" && get "to" czech = `String "CZ"
    && match num (get "mw" czech) with Some n -> abs_float (n -. 715.7) < 0.001 | None -> false);
  check "missing outgoing counterpart invalidates national net" (get "netImportMw" (first (List.tl observed)) = `Null)

let () =
  let series name value = `Assoc ["name", `String name; "data", `List [`Float value]] in
  let production = List.map (fun name -> series name 100.) [
    "Fossil hard coal"; "Fossil brown coal / lignite"; "Fossil gas"; "Fossil coal-derived gas";
    "Wind onshore"; "Wind offshore"; "Solar"; "Hydro Run-of-River"; "Hydro water reservoir";
    "Biomass"; "Hydro pumped storage"; "Others"; "Fossil oil"; "Other renewables"] in
  let power = `Assoc [
    "unix_seconds", `List [`Float (Option.get (Time.bounds "2026-09-14") |> fst)];
    "production_types", `List (production @ [series "Load" 1800.;
      series "Hydro pumped storage consumption" (-80.); series "Cross border electricity trading" 300.;
      series "Renewable share of generation" 77.])] in
  let first = Normalize.day ~date:"2026-09-14" ~power ~flows:empty ~prices:empty ~guidance:empty |> List.hd in
  check "generation excludes load, pumping, trade and percentage series" (num (get "generationMw" first) = Some 1400.);
  check "storage discharge is excluded from renewable numerator" (num (get "renewablePercent" first) = Some 50.);
  check "reported load remains independent" (num (get "demandMw" first) = Some 1800.);
  check "pumping demand is displayed as a positive magnitude" (num (get "pumpingMw" first) = Some 80.)

let () =
  let at value = Option.get (Time.parse_utc value) in
  let now = at "2026-09-14T22:03:00Z" in
  check "today refreshes every five minutes" (Store.cache_ttl ~date:"2026-09-15" ~now = 300.);
  check "yesterday keeps refreshing after Warsaw midnight" (Store.cache_ttl ~date:"2026-09-14" ~now = 300.);
  check "older dates retain six-hour cache" (Store.cache_ttl ~date:"2026-09-13" ~now = 21600.);
  check "yesterday is correct late on a 25-hour day"
    (Store.cache_ttl ~date:"2026-10-24" ~now:(at "2026-10-25T22:30:00Z") = 300.);
  check "yesterday is correct after a 23-hour day"
    (Store.cache_ttl ~date:"2026-03-29" ~now:(at "2026-03-29T22:03:00Z") = 300.);
  let guidance value = `Assoc ["value", `List [`Assoc [
    "dtime_utc", `String "2026-09-13 22:00";
    "publication_ts_utc", `String "2026-09-13 20:00";
    "is_active", `Bool true; "usage_fcst", `Float value]]] in
  let normalized value = Normalize.day ~date:"2026-09-14" ~power:`Null
    ~flows:empty ~prices:empty ~guidance:(guidance value) |> List.hd |> get "guidance" in
  check "fractional guidance is not silently converted to an official category" (normalized 1.5 = `Null);
  check "integral floating-point guidance remains valid" (normalized 2. = `Int 2)
