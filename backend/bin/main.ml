open Lwt.Infix

let json ?(status=`OK) body =
  let headers = Cohttp.Header.of_list [
    "content-type", "application/json; charset=utf-8";
    "cache-control", "no-store";
    "x-content-type-options", "nosniff"
  ] in
  Cohttp_lwt_unix.Server.respond_string ~status ~headers ~body:(Yojson.Safe.to_string body) ()

let callback _ request _body =
  let uri = Cohttp.Request.uri request in
  if Cohttp.Request.meth request <> `GET then
    json ~status:`Method_not_allowed (`Assoc ["error", `String "Only GET is supported"])
  else match Uri.path uri with
  | "/api/health" ->
      json (`Assoc ["status", `String "ok"; "service", `String "prad-polski-ocaml"; "ocaml", `String Sys.ocaml_version])
  | "/api/v1/day" ->
      let date = Option.value ~default:(Grid.Time.today (Unix.gettimeofday ())) (Uri.get_query_param uri "date") in
      if Option.is_none (Grid.Time.date_parts date) || date < "2024-06-14"
         || date > Grid.Time.today (Unix.gettimeofday ()) then
        json ~status:`Bad_request (`Assoc ["error", `String "Wybierz datę od 2024-06-14 do dzisiaj."])
      else
        Lwt.catch
          (fun () -> Grid.Store.load_day date >>= json)
          (fun error ->
            prerr_endline (Printexc.to_string error);
            json ~status:`Service_unavailable (`Assoc ["error", `String "Dane są chwilowo niedostępne. Spróbuj ponownie."]))
  | _ -> json ~status:`Not_found (`Assoc ["error", `String "Not found"])

let () =
  let port = Option.value ~default:"8080" (Sys.getenv_opt "PORT") |> int_of_string in
  let host = Option.value ~default:"127.0.0.1" (Sys.getenv_opt "HOST") in
  let address = Unix.inet_addr_of_string host in
  Printf.printf "Prąd Polski API — OCaml %s — http://%s:%d\n%!" Sys.ocaml_version host port;
  let socket = Lwt_unix.socket Unix.PF_INET Unix.SOCK_STREAM 0 in
  Lwt_unix.setsockopt socket Unix.SO_REUSEADDR true;
  let rec refresh_loop () =
    Lwt.catch
      (fun () -> Grid.Store.load_day (Grid.Time.today (Unix.gettimeofday ())) >|= fun _ -> ())
      (fun error -> prerr_endline (Printexc.to_string error); Lwt.return_unit)
    >>= fun () -> Lwt_unix.sleep 300. >>= refresh_loop
  in
  Lwt.async refresh_loop;
  Lwt_main.run (
    Lwt_unix.bind socket (Unix.ADDR_INET (address, port)) >>= fun () ->
    Lwt_unix.listen socket 128;
    Cohttp_lwt_unix.Server.create ~mode:(`TCP (`Socket socket))
      (Cohttp_lwt_unix.Server.make ~callback ())
  )
