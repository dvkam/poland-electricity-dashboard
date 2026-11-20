open Grid

let () =
  let path = Filename.temp_file "day-cache-test" ".json" in
  Fun.protect ~finally:(fun () -> Sys.remove path) (fun () ->
    let cache = Day_cache.create ~capacity:2 in
    let t = ref 0. and count = ref 0 in
    let load ?(expiry=Some 10.) date =
      Lwt_main.run (Day_cache.load cache ~date ~paths:[path] ~now:(fun () -> !t) ~assemble:(fun () ->
        incr count; Lwt.return (string_of_int !count, expiry))) in
    assert (load "A" = "1" && load "A" = "1");
    (* Source snapshots replace the live file atomically, even for same-size revisions. *)
    let replacement = Filename.temp_file ~temp_dir:(Filename.dirname path) "revision" ".json" in
    Unix.rename replacement path;
    assert (load "A" = "2");
    t := 10.;
    assert (load ~expiry:None "A" = "3" && load ~expiry:None "A" = "4");
    t := 0.;
    assert (load "A" = "5" && load "B" = "6" && load "A" = "5" && load "C" = "7");
    assert (load "B" = "8");
    let pending, resume = Lwt.wait () in
    let in_progress = Day_cache.load cache ~date:"D" ~paths:[path] ~now:(fun () -> !t)
      ~assemble:(fun () -> pending) in
    let replacement = Filename.temp_file ~temp_dir:(Filename.dirname path) "revision" ".json" in
    Unix.rename replacement path;
    Lwt.wakeup resume ("earlier revision", Some 10.);
    assert (Lwt_main.run in_progress = "earlier revision" && load "D" = "9"))

let () =
  let date = "2026-10-25" in
  let now = Option.get (Time.parse_utc "2026-10-25T12:00:00Z") in
  let source = Store.{payload=`Null; fetched_at=Some now; cached=true; error=None; url="source"; id="prices"} in
  let deadline resources = Store.stable_until ~date ~now resources in
  assert (deadline [source; {source with fetched_at=Some (now -. 20.)}] = Some (now +. 280.));
  assert (deadline [source; {source with error=Some "revalidating"}] = None);
  assert (deadline [{source with cached=false}] = None);
  assert (deadline [{source with fetched_at=None}] = None)
