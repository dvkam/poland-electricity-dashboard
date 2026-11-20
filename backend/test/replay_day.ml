(* Replay archived upstream responses through the production day presenter. *)
let () =
  let date = Sys.argv.(1) and directory = Sys.argv.(2) in
  let resources = List.map (fun id ->
    let payload = Yojson.Safe.from_file (Filename.concat directory (id ^ ".json")) in
    Grid.Store.validate ~date id payload;
    Grid.Store.{ id; url="https://example.org"; cached=true; error=None;
      fetched_at=None; payload }
  ) ["generation"; "flows"; "prices"; "guidance"] in
  Grid.Store.day_response date resources |> Yojson.Safe.to_channel stdout
