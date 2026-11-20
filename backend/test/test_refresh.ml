open Grid
open Lwt.Infix

let date = "2026-10-25"
let url = "https://api.raporty.pse.pl/api/prices"
let next = url ^ "?page=2"
let page value = `Assoc ["value", `List [`Assoc [
  "business_date", `String date; "dtime_utc", `String "2026-10-25 19:15";
  "period_utc", `String "19:00 - 19:15"; "rce_pln", `Int value;
  "publication_ts_utc", `String "2026-10-25 20:00:00"]]]
let first = match page 1 with `Assoc fields -> `Assoc (("nextLink", `String next) :: fields) | _ -> assert false

let with_directory test =
  let dir = Filename.temp_file "source-refresh" "" in
  Sys.remove dir; Unix.mkdir dir 0o700;
  Fun.protect ~finally:(fun () ->
    Array.iter (fun f -> Sys.remove (Filename.concat dir f)) (Sys.readdir dir);
    Unix.rmdir dir) (fun () -> test dir)

let () = with_directory (fun directory ->
  let now = ref 1_800_000_000. in
  let state = Store.refresh_state ~now:(fun () -> !now) ~timeout:0.06 () in
  let pages = ref [] and recovering = ref false in
  let fetch address =
    pages := address :: !pages;
    if !recovering then Lwt.return (page 20)
    else if address = url then Lwt.return first
    else Lwt_unix.sleep 5. >|= fun () -> page 2 in
  let get () = Store.get_using state ~directory ~fetch ~date ~id:"prices" ~url in
  let callers = List.init 10 (fun _ -> get ()) in
  let abandoned = List.hd callers in
  Lwt.cancel abandoned;
  let failures = Lwt_main.run (Lwt_unix.with_timeout 1. (fun () -> Lwt.all (List.tl callers))) in
  assert (!pages = [next; url]);
  assert (List.for_all (fun (r : Store.resource) ->
    r.error = Some "Upłynął czas na pobranie raportu." && r.payload = `Null) failures);
  assert ((Lwt_main.run (get ())).error = (List.hd failures).error && !pages = [next; url]);
  now := !now +. 31.;
  recovering := true;
  let fresh = Lwt_main.run (get ()) in
  assert (fresh.payload = page 20 && fresh.error = None && !pages = [url; next; url]))

let () = with_directory (fun directory ->
  let path = Store.cache_path ~directory ~date "prices" in
  Store.save path (page 7) 1.;
  let now = ref 1_800_000_000. in
  let state = Store.refresh_state ~now:(fun () -> !now) () in
  let pending, resume = Lwt.task () in
  let calls = ref 0 in
  let fetch _ = incr calls; pending in
  let get fetch = Store.get_using state ~directory ~fetch ~date ~id:"prices" ~url in
  for _ = 1 to 10 do
    let stale = Lwt_main.run (get fetch) in
    assert (stale.cached && stale.fetched_at = Some 1. && stale.payload = page 7 && stale.error <> None)
  done;
  assert (!calls = 1);
  Lwt.wakeup_exn resume (Store.Retry_after (429, !now +. 90.));
  now := !now +. 45.;
  let blocked = Lwt_main.run (get fetch) in
  assert (blocked.cached && blocked.error = Some "Źródło zwróciło HTTP 429. Pokazujemy ostatni dostępny zapis." && !calls = 1);
  now := !now +. 46.;
  let fresh = Lwt_main.run (get (fun _ -> incr calls; Lwt.return (page 12))) in
  assert (fresh.payload = page 12 && fresh.error = None && !calls = 2);
  let cached = Lwt_main.run (get fetch) in
  assert (cached.cached && cached.error = None && cached.payload = page 12 && !calls = 2))

let () =
  assert (Store.retry_time ~now:100. "75" = Some 175.);
  assert (Store.retry_time ~now:0. "Fri, 20 Nov 2026 14:00:00 GMT" = Time.parse_utc "2026-11-20T14:00:00Z");
  assert (Store.retry_time ~now:0. "invalid" = None)
