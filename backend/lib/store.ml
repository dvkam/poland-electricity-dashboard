open Lwt.Infix

type resource = { payload : Yojson.Safe.t; fetched_at : float option; cached : bool; error : string option; url : string; id : string }
let directory = Option.value ~default:"../data" (Sys.getenv_opt "DATA_DIR")
let () = if not (Sys.file_exists directory) then Unix.mkdir directory 0o750
let locks : (string, Lwt_mutex.t) Hashtbl.t = Hashtbl.create 32
let lock key = match Hashtbl.find_opt locks key with Some lock -> lock | None ->
  let lock = Lwt_mutex.create () in Hashtbl.add locks key lock; lock

exception Source_error of string

let decode_response status body =
  if status < 200 || status >= 300 then
    raise (Source_error (Printf.sprintf "Źródło zwróciło HTTP %d." status));
  try Yojson.Safe.from_string body with _ ->
    raise (Source_error "Źródło zwróciło nieprawidłowy JSON.")

let validate id payload =
  let key = if id = "generation" then "unix_seconds" else "value" in
  match Normalize.field key payload with
  | `List [] -> raise (Source_error "Źródło nie opublikowało jeszcze danych dla tego dnia.")
  | `List _ when id <> "generation" -> ()
  | `List _ -> (match Normalize.field "production_types" payload with
      | `List (_ :: _) -> ()
      | _ -> raise (Source_error "Odpowiedź źródła nie zawiera serii produkcji."))
  | _ -> raise (Source_error "Odpowiedź źródła ma niezgodny format.")

let persist persist_fn payload fetched_at =
  try persist_fn payload fetched_at; None with exn ->
    prerr_endline ("Cache write failed: " ^ Printexc.to_string exn);
    Some "Dane pobrano, ale nie udało się zapisać lokalnej kopii."

let request url =
  let argv = [| "curl"; "--silent"; "--show-error"; "--location";
    "--write-out"; "\n%{http_code}";
    "--max-time"; "25"; "--connect-timeout"; "8"; "--max-filesize"; "8000000"; url |] in
  Lwt_process.with_process_full ("curl", argv) (fun process ->
    Lwt.both (Lwt_io.read process#stdout) (Lwt_io.read process#stderr) >>= fun (body, stderr) ->
    process#status >>= function
    | Unix.WEXITED 0 ->
        let split = String.rindex body '\n' in
        let status = int_of_string (String.sub body (split + 1) (String.length body - split - 1)) in
        Lwt.return (decode_response status (String.sub body 0 split))
    | _ ->
        prerr_endline ("Source transport failed: " ^ url ^ " " ^ stderr);
        Lwt.fail (Source_error "Nie udało się połączyć ze źródłem (sieć lub limit czasu)."))

let rec paginated ?(remaining=20) url =
  request url >>= fun payload ->
  match Normalize.string (Normalize.field "nextLink" payload) with
  | Some next when remaining > 0 && String.starts_with ~prefix:"https://api.raporty.pse.pl/api/" next ->
      paginated ~remaining:(remaining - 1) next >|= fun rest ->
      `Assoc ["value", `List (Normalize.list (Normalize.field "value" payload) @ Normalize.list (Normalize.field "value" rest))]
  | Some _ -> Lwt.fail_with "Niepełna odpowiedź źródła"
  | None -> Lwt.return payload

let read path =
  try
    let envelope = Yojson.Safe.from_file path in
    match Normalize.number (Normalize.field "fetchedAt" envelope) with
    | Some fetched -> Some (Normalize.field "payload" envelope, fetched)
    | None -> None
  with _ -> None

let save path payload fetched =
  let envelope = `Assoc ["fetchedAt", `Float fetched; "payload", payload] in
  let temporary = path ^ ".tmp" in
  Yojson.Safe.to_file temporary envelope;
  Unix.rename temporary path;
  let archive = path ^ "." ^ string_of_int (int_of_float fetched) ^ ".json" in
  Yojson.Safe.to_file archive envelope

(* Yesterday can still receive late measurements and revisions. Derive its
   calendar date from Warsaw midnight rather than subtracting a 24-hour day. *)
let cache_ttl ~date ~now =
  let today = Time.today now in
  let yesterday = match Time.bounds today with
    | Some (midnight, _) -> Time.today (midnight -. 1.)
    | None -> assert false in
  if date = today || date = yesterday then 300. else 21600.

let get ~date ~id ~url =
  let key = id ^ "-" ^ date in
  Lwt_mutex.with_lock (lock key) (fun () ->
    let path = Filename.concat directory (key ^ ".json") in
    let previous = read path in
    let now = Unix.gettimeofday () in
    let ttl = cache_ttl ~date ~now in
    match previous with
    | Some (payload, fetched) when now -. fetched < ttl ->
        Lwt.return {payload; fetched_at=Some fetched; cached=true; error=None; url; id}
    | _ ->
        Lwt.catch
          (fun () -> paginated url >|= fun payload ->
            validate id payload;
            let fetched_at = Unix.gettimeofday () in
            let error = persist (save path) payload fetched_at in
            {payload; fetched_at=Some fetched_at; cached=false; error; url; id})
          (fun exn ->
            prerr_endline ("Source fetch failed: " ^ url ^ " " ^ Printexc.to_string exn);
            let reason = match exn with Source_error message -> message
              | _ -> "Nie udało się przetworzyć odpowiedzi źródła." in
            let payload, fetched = match previous with Some (p, t) -> p, Some t | None -> `Null, None in
            Lwt.return {payload; fetched_at=fetched; cached=Option.is_some fetched;
              error=Some (reason ^ (if Option.is_some fetched then " Pokazujemy ostatni dostępny zapis." else ""));
              url; id}))

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
    "cached", `Bool resource.cached;
    "error", (match resource.error with Some value -> `String value | None -> `Null)
  ]

let load_day date =
  let pse report extra = "https://api.raporty.pse.pl/api/" ^ report
    ^ "?$filter=" ^ Uri.pct_encode ("business_date eq '" ^ date ^ "'" ^ extra)
    ^ "&$first=500" in
  let requests = [
    ("generation", "https://api.energy-charts.info/public_power?country=pl&start=" ^ date ^ "&end=" ^ date);
    ("flows", pse "przeplywy-mocy" "");
    ("prices", pse "rce-pln" "");
    ("guidance", pse "pdgsz" " and is_active eq true")
  ] in
  Lwt_list.map_p (fun (id, url) -> get ~date ~id ~url) requests >|= fun resources ->
  let payload id = match List.find_opt (fun r -> r.id = id) resources with Some r -> r.payload | None -> `Null in
  let points = Normalize.day ~date ~power:(payload "generation") ~flows:(payload "flows")
    ~prices:(payload "prices") ~guidance:(payload "guidance") in
  `Assoc [
    "schemaVersion", `Int 1; "date", `String date; "timezone", `String "Europe/Warsaw";
    "generatedAt", `String (Time.iso (Unix.gettimeofday ()));
    "sources", `List (List.map source_json resources);
    "points", `List points
  ]
