open Lwt.Infix

type resource = { payload : Yojson.Safe.t; fetched_at : float option; cached : bool; error : string option; url : string; id : string }
let directory = Option.value ~default:"../data" (Sys.getenv_opt "DATA_DIR")
let () = if not (Sys.file_exists directory) then Unix.mkdir directory 0o750
exception Source_error of string
exception Retry_after of int * float

let retry_time ~now value =
  let value = String.trim value in
  match int_of_string_opt value with
  | Some seconds when seconds >= 0 -> Some (now +. float_of_int seconds)
  | _ ->
      let months = ["Jan"; "Feb"; "Mar"; "Apr"; "May"; "Jun";
        "Jul"; "Aug"; "Sep"; "Oct"; "Nov"; "Dec"] in
      try Scanf.sscanf value "%3s, %d %s %d %d:%d:%d GMT%!"
        (fun _ day month year hour minute second ->
          match List.find_index ((=) month) months with
          | None -> None
          | Some m -> Option.map Ptime.to_float_s
              (Ptime.of_date_time ((year, m + 1, day), ((hour, minute, second), 0))))
      with Scanf.Scan_failure _ | End_of_file | Failure _ -> None

let decode_response status body =
  if status < 200 || status >= 300 then
    raise (Source_error (Printf.sprintf "Źródło zwróciło HTTP %d." status));
  try Yojson.Safe.from_string body with _ ->
    raise (Source_error "Źródło zwróciło nieprawidłowy JSON.")

let known_flow_section code =
  List.exists (fun partner -> code = partner ^ "-PL" || code = "PL-" ^ partner)
    ("UA_DOB" :: Normalize.border_codes)

let matches_pse_quarter row finish =
  let clock t = String.sub (Time.iso t) 11 5 in
  match Normalize.field "period_utc" row with
  | `String period ->
      let first = clock (finish -. 900.) and last = clock finish in
      period = first ^ " - " ^ last || (last = "00:00" && period = first ^ " - 24:00")
  | _ -> false

let valid_pse_row ~date id row =
  let open Normalize in
  let nullable key valid = match row with
    | `Assoc fields -> (match List.assoc_opt key fields with
      | Some `Null -> true | Some value -> valid value | None -> false)
    | _ -> false in
  let numeric key = nullable key (fun value -> Option.is_some (number value)) in
  let valid_period = match timestamp "dtime_utc" row with
    | None -> false
    | Some t when id = "guidance" -> Time.today t = date && mod_float t 3600. = 0.
    | Some t -> Time.today (t -. 1.) = date && mod_float t 900. = 0. && matches_pse_quarter row t in
  field "business_date" row = `String date && valid_period
  && Option.is_some (timestamp "publication_ts_utc" row)
  && (match id with
    | "prices" -> numeric "rce_pln"
    | "flows" -> numeric "value" && (match string (field "section_code" row) with
        | Some code -> known_flow_section code | None -> false)
    | "guidance" -> field "is_active" row = `Bool true &&
        nullable "usage_fcst" (fun v -> match number v with
          | Some n -> Float.floor n = n && n >= 0. && n <= 3. | None -> false)
    | _ -> false)

let validate ~date id payload =
  let payload = if id = "generation" then
    (try Normalize.public_power_v2 ~date payload with Invalid_argument _ ->
      raise (Source_error "Nieobsługiwany format, jednostka lub okres danych produkcji."))
    else payload in
  let key = if id = "generation" then "unix_seconds" else "value" in
  match Normalize.field key payload with
  | `List [] -> raise (Source_error "Źródło nie opublikowało jeszcze danych dla tego dnia.")
  | `List rows when id <> "generation" ->
      if not (List.for_all (valid_pse_row ~date id) rows) then
        raise (Source_error "Raport PSE zawiera nieprawidłowy wiersz lub datę.")
  | `List _ -> (match Normalize.field "production_types" payload with
      | `List (_ :: _) -> ()
      | _ -> raise (Source_error "Odpowiedź źródła nie zawiera serii produkcji."))
  | _ -> raise (Source_error "Odpowiedź źródła ma niezgodny format.")

let require_displayed_section id payload =
  if id = "flows" then begin
    let displayed row = match Normalize.string (Normalize.field "section_code" row) with
      | Some code -> List.exists (fun border -> code = border ^ "-PL" || code = "PL-" ^ border) Normalize.border_codes
      | None -> false in
    if not (List.exists displayed (Normalize.list (Normalize.field "value" payload))) then
      raise (Source_error "Raport PSE nie zawiera danych o wyświetlanych granicach.")
  end

let persist persist_fn payload fetched_at =
  try persist_fn payload fetched_at; None with exn ->
    prerr_endline ("Cache write failed: " ^ Printexc.to_string exn);
    Some "Dane pobrano, ale nie udało się zapisać lokalnej kopii."

let request url =
  let argv = [| "curl"; "--silent"; "--show-error"; "--location";
    "--write-out"; "\n%{http_code} %header{retry-after}";
    "--max-time"; "25"; "--connect-timeout"; "8"; "--max-filesize"; "8000000"; url |] in
  let process = Lwt_process.open_process_full ("curl", argv) in
  Lwt.finalize (fun () ->
    Lwt.both (Lwt_io.read process#stdout) (Lwt_io.read process#stderr) >>= fun (body, stderr) ->
    process#status >>= function
    | Unix.WEXITED 0 ->
        let split = String.rindex body '\n' in
        let status = int_of_string (String.sub body (split + 1) 3) in
        let retry = String.sub body (split + 5) (String.length body - split - 5) in
        (match status, retry_time ~now:(Unix.gettimeofday ()) retry with
        | (429 | 503), Some until -> Lwt.fail (Retry_after (status, until))
        | _ -> Lwt.return (decode_response status (String.sub body 0 split)))
    | _ ->
        prerr_endline ("Source transport failed: " ^ url ^ " " ^ stderr);
        Lwt.fail (Source_error "Nie udało się połączyć ze źródłem (sieć lub limit czasu)."))
    (fun () ->
      (match process#state with Lwt_process.Running -> process#terminate | _ -> ());
      process#close >|= fun _ -> ())

let rec paginated ~fetch ~date ~id ?(remaining=20) url =
  fetch url >>= fun payload ->
  validate ~date id payload;
  match Normalize.field "nextLink" payload with
  | `String next when remaining > 0 && String.starts_with ~prefix:"https://api.raporty.pse.pl/api/" next ->
      paginated ~fetch ~date ~id ~remaining:(remaining - 1) next >|= fun rest ->
      `Assoc ["value", `List (Normalize.list (Normalize.field "value" payload) @ Normalize.list (Normalize.field "value" rest))]
  | `Null -> Lwt.return payload
  | _ -> Lwt.fail_with "Niepełna odpowiedź źródła"

let read path =
  try
    let envelope = Yojson.Safe.from_file path in
    match Normalize.number (Normalize.field "fetchedAt" envelope) with
    | Some fetched -> Some (Normalize.field "payload" envelope, fetched)
    | None -> None
  with _ -> None

let save path payload fetched =
  let envelope = `Assoc ["fetchedAt", `Float fetched; "payload", payload] in
  (* Exclusive unique names preserve revisions even within the same second.
     Archive first so a successful cache replacement always has a snapshot. *)
  let _, channel = Filename.open_temp_file ~temp_dir:(Filename.dirname path)
    (Filename.basename path ^ "." ^ Printf.sprintf "%.6f" fetched ^ "-") ".json" in
  Fun.protect ~finally:(fun () -> close_out_noerr channel)
    (fun () -> Yojson.Safe.to_channel channel envelope; flush channel);
  let temporary = path ^ ".tmp" in
  Yojson.Safe.to_file temporary envelope;
  Unix.rename temporary path

(* Yesterday can still receive late measurements and revisions. Derive its
   calendar date from Warsaw midnight rather than subtracting a 24-hour day. *)
let cache_ttl ~date ~now =
  let today = Time.today now in
  let yesterday = match Time.bounds today with
    | Some (midnight, _) -> Time.today (midnight -. 1.)
    | None -> assert false in
  if date = today || date = yesterday then 300. else 21600.

let cache_path ~directory ~date id =
  let prefix = if id = "generation" then "generation-v2" else id in
  Filename.concat directory (prefix ^ "-" ^ date ^ ".json")

type flight = { result : resource Lwt.t; stale : resource option }
type refresh_state = {
  flights : (string, flight) Hashtbl.t;
  mutable failures : (string * (float * string)) list;
  now : unit -> float;
  timeout : float;
}

let refresh_state ?(now=Unix.gettimeofday) ?(timeout=40.) () =
  {flights=Hashtbl.create 16; failures=[]; now; timeout}

let serve_flight flight =
  match flight.stale, Lwt.state flight.result with
  | Some stale, Lwt.Sleep -> Lwt.return stale
  | _ -> Lwt.protected flight.result

let get_using state ~directory ~fetch ~date ~id ~url =
  let path = cache_path ~directory ~date id in
  match Hashtbl.find_opt state.flights path with
  | Some flight -> serve_flight flight
  | None ->
    let previous = Option.bind (read path) (fun (payload, t) ->
      try validate ~date id payload; require_displayed_section id payload;
          Some {payload; fetched_at=Some t; cached=true; error=None; url; id}
      with Source_error _ -> None) in
    let now = state.now () in
    let fallback reason = match previous with
      | Some old -> {old with error=Some (reason ^ " Pokazujemy ostatni dostępny zapis.")}
      | None -> {payload=`Null; fetched_at=None; cached=false; error=Some reason; url; id} in
    state.failures <- List.filter (fun (_, (until, _)) -> until > now) state.failures;
    match previous, List.assoc_opt path state.failures with
    | Some ({fetched_at=Some t; _} as old), _ when now -. t < cache_ttl ~date ~now -> Lwt.return old
    | _, Some (_, reason) -> Lwt.return (fallback reason)
    | _ ->
        let result = Lwt.catch (fun () ->
          Lwt_unix.with_timeout state.timeout (fun () -> paginated ~fetch ~date ~id url)
          >|= fun payload ->
          require_displayed_section id payload;
          let fetched_at = state.now () in
          let error = persist (save path) payload fetched_at in
          {payload; fetched_at=Some fetched_at; cached=false; error; url; id})
          (fun exn ->
            let now = state.now () in
            let reason, retry_at = match exn with
              | Retry_after (status, until) ->
                  Printf.sprintf "Źródło zwróciło HTTP %d." status, max (now +. 1.) until
              | Source_error message -> message, now +. 30.
              | Lwt_unix.Timeout -> "Upłynął czas na pobranie raportu.", now +. 30.
              | _ -> "Nie udało się przetworzyć odpowiedzi źródła.", now +. 30. in
            prerr_endline ("Source fetch failed: " ^ url ^ " " ^ Printexc.to_string exn);
            state.failures <- List.take 256 ((path, (retry_at, reason)) :: state.failures);
            Lwt.return (fallback reason)) in
        let stale = Option.map (fun _ -> fallback "Trwa aktualizacja danych.") previous in
        let flight = {result; stale} in
        Hashtbl.add state.flights path flight;
        Lwt.on_termination result (fun () -> Hashtbl.remove state.flights path);
        serve_flight flight

let get_with ~directory ~fetch ~date ~id ~url =
  get_using (refresh_state ()) ~directory ~fetch ~date ~id ~url

let get = get_using (refresh_state ()) ~directory ~fetch:request

let source_json resource =
  let name, note, home = match resource.id with
  | "generation" -> "Energy-Charts · Fraunhofer ISE",
      "Produkcja publiczna i zapotrzebowanie, według danych ENTSO-E. Nie przedstawia miksu energii zużywanej w konkretnym domu. Magazyny pokazujemy oddzielnie od OZE.",
      "https://www.energy-charts.info/"
  | "flows" -> "PSE · przepływy fizyczne",
      "Przepływy na sześciu przekrojach. Sumujemy dodatni kierunek do Polski i ujemny kierunek z Polski dla każdego przekroju. Strzałka przedstawia wynik netto. Znacznik raportu wyznacza koniec kwadransa; przeliczamy go na przedział.",
      "https://raporty.pse.pl/report/przeplywy-mocy"
  | "prices" -> "PSE · Rynkowa Cena Energii",
      "RCE w PLN/MWh. To wskaźnik rynkowy, a nie pełna cena na rachunku ani uniwersalny indeks każdej umowy dynamicznej. Bez doliczonych opłat i podatków.",
      "https://raporty.pse.pl/report/rce-pln"
  | _ -> "PSE · Energetyczny Kompas",
      "Oficjalna prognoza zalecanego korzystania z energii. Wykorzystujemy wyłącznie aktywną wersję publikacji; okres obowiązywania wynosi godzinę.",
      "https://www.energetycznykompas.pl/" in
  `Assoc [
    "id", `String resource.id; "name", `String name; "url", `String home;
    "endpoint", `String resource.url; "note", `String note;
    "fetchedAt", Normalize.json_time resource.fetched_at;
    "providerGeneratedAt", (if resource.id = "generation"
      then Normalize.publication_time "generated_at" resource.payload else `Null);
    "cached", `Bool resource.cached;
    "error", (match resource.error with Some value -> `String value | None -> `Null)
  ]

let day_response date resources =
  let payload id = match List.find_opt (fun r -> r.id = id) resources with Some r -> r.payload | None -> `Null in
  let power = match payload "generation" with `Null -> `Null | p -> Normalize.public_power_v2 ~date p in
  let points = Normalize.day ~date ~power ~flows:(payload "flows")
    ~prices:(payload "prices") ~guidance:(payload "guidance") in
  `Assoc [
    "schemaVersion", `Int 1; "date", `String date; "timezone", `String "Europe/Warsaw";
    "generatedAt", `String (Time.iso (Unix.gettimeofday ()));
    "sources", `List (List.map source_json resources);
    "points", `List points
  ]

let load_day date =
  let pse report extra = "https://api.raporty.pse.pl/api/" ^ report
    ^ "?$filter=" ^ Uri.pct_encode ("business_date eq '" ^ date ^ "'" ^ extra)
    ^ "&$first=500" in
  let requests = [
    ("generation", "https://api.energy-charts.info/v2/public_power?country=pl&start=" ^ date ^ "&end=" ^ date);
    ("flows", pse "przeplywy-mocy" "");
    ("prices", pse "rce-pln" "");
    ("guidance", pse "pdgsz" " and is_active eq true")
  ] in
  Lwt_list.map_p (fun (id, url) -> get ~date ~id ~url) requests >|= day_response date
