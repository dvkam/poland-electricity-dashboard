let field key = function `Assoc fields -> (try List.assoc key fields with Not_found -> `Null) | _ -> `Null
let string = function `String value -> Some value | _ -> None
let number = function
  | `Int value -> Some (float_of_int value)
  | `Float value when Float.is_finite value -> Some value
  | _ -> None
let list = function `List values -> values | _ -> []
let json_number = function Some value -> `Float value | None -> `Null
let json_time = function Some value -> `String (Time.iso value) | None -> `Null
let timestamp key row = Option.bind (string (field key row)) Time.parse_utc

let sum values =
  if List.exists Option.is_none values then None
  else Some (List.fold_left (fun total value -> total +. Option.value ~default:0. value) 0. values)

let groups = [
  ("coal", ["Fossil hard coal"]);
  ("lignite", ["Fossil brown coal / lignite"]);
  ("gas", ["Fossil gas"; "Fossil coal-derived gas"]);
  ("wind", ["Wind onshore"; "Wind offshore"]);
  ("solar", ["Solar"]);
  ("hydro", ["Hydro Run-of-River"; "Hydro water reservoir"]);
  ("biomass", ["Biomass"]);
  ("storage", ["Hydro pumped storage"]);
  ("other", ["Others"; "Fossil oil"; "Other renewables"])
]

let power_index power =
  let times = Array.of_list (list (field "unix_seconds" power)) in
  let types = list (field "production_types" power) |> List.filter_map (fun entry ->
    Option.map (fun name -> name, Array.of_list (list (field "data" entry))) (string (field "name" entry))) in
  let points = Hashtbl.create 100 in
  Array.iteri (fun index time ->
    match number time with
    | None -> ()
    | Some start ->
        let get name =
          match List.assoc_opt name types with
          | Some values when index < Array.length values -> number values.(index)
          | _ -> None
        in
        let mix = List.map (fun (key, names) -> key, sum (List.map get names)) groups in
        let total = sum (List.map snd mix) in
        let renewable = sum (List.map get ["Solar"; "Wind onshore"; "Wind offshore";
          "Hydro Run-of-River"; "Hydro water reservoir"; "Biomass"; "Other renewables"]) in
        let share = match renewable, total with Some r, Some t when t > 0. -> Some (r /. t *. 100.) | _ -> None in
        Hashtbl.replace points (int_of_float start) (mix, total, share, get "Load", get "Hydro pumped storage consumption")
  ) times;
  points

let latest_row rows predicate =
  List.filter predicate rows
  |> List.sort (fun a b -> Float.compare
      (Option.value ~default:0. (timestamp "publication_ts_utc" b))
      (Option.value ~default:0. (timestamp "publication_ts_utc" a)))
  |> List.find_opt (fun _ -> true)

let row_for_end rows finish =
  latest_row rows (fun row ->
    match timestamp "dtime_utc" row with Some value -> abs_float (value -. finish) < 1. | None -> false)

let border_codes = ["DE"; "CZ"; "SK"; "UA"; "LT"; "SE"]

(* PSE physical-flow report: positive values are imports into Poland.
   Report dtime_utc is the END of the measurement period. *)
let flow_json country row =
  let value = Option.bind row (fun value -> number (field "value" value)) in
  let from_, to_ = match value with
    | Some value when value < 0. -> "PL", country
    | _ -> country, "PL" in
  `Assoc [
    "country", `String country; "from", `String from_; "to", `String to_;
    "mw", json_number (Option.map abs_float value);
    "signedImportMw", json_number value; "kind", `String "physical";
    "publishedAt", json_time (Option.bind row (timestamp "publication_ts_utc"))
  ]

let day ~date ~power ~flows ~prices ~guidance =
  let indexed = power_index power in
  let flow_rows = list (field "value" flows)
  and price_rows = list (field "value" prices)
  and guidance_rows = list (field "value" guidance) in
  Time.slots date |> List.map (fun start ->
    let finish = start +. 900. in
    let mix, total, renewable, demand, pumping =
      match Hashtbl.find_opt indexed (int_of_float start) with
      | Some point -> point
      | None -> List.map (fun (key, _) -> key, None) groups, None, None, None, None in
    let border_flows = List.map (fun country ->
      let matching section = latest_row flow_rows (fun row ->
        string (field "section_code" row) = Some section
        && (match timestamp "dtime_utc" row with Some value -> abs_float (value -. finish) < 1. | None -> false)) in
      let incoming = matching (country ^ "-PL") in
      let outgoing = matching ("PL-" ^ country) in
      let incoming_value = Option.bind incoming (fun row -> number (field "value" row)) in
      let outgoing_value = Option.bind outgoing (fun row -> number (field "value" row)) in
      let net_value = sum [incoming_value; outgoing_value] in
      let publication = List.filter_map (fun row -> Option.bind row (timestamp "publication_ts_utc")) [incoming; outgoing]
        |> List.sort Float.compare |> List.rev |> List.find_opt (fun _ -> true) in
      let row = Option.map (fun value -> `Assoc [
        "value", `Float value; "publication_ts_utc", json_time publication]) net_value in
      match flow_json country row with
      | `Assoc fields -> `Assoc (fields @ [
          "importMw", json_number incoming_value;
          "exportMw", json_number (Option.map abs_float outgoing_value)])
      | other -> other) border_codes in
    let net = sum (List.map (fun flow -> number (field "signedImportMw" flow)) border_flows) in
    let price = row_for_end price_rows finish in
    let advice = latest_row guidance_rows (fun row ->
      field "is_active" row = `Bool true &&
      match timestamp "dtime_utc" row with Some value -> value <= start && value +. 3600. > start | None -> false) in
    `Assoc [
      "start", `String (Time.iso start); "end", `String (Time.iso finish);
      "generation", `Assoc (List.map (fun (key, value) -> key, json_number value) mix);
      "generationMw", json_number total; "demandMw", json_number demand;
      "renewablePercent", json_number renewable;
      "pumpingMw", json_number (Option.map abs_float pumping);
      "netImportMw", json_number net; "flows", `List border_flows;
      "rcePlnMwh", json_number (Option.bind price (fun row -> number (field "rce_pln" row)));
      "pricePublishedAt", json_time (Option.bind price (timestamp "publication_ts_utc"));
      "guidance", (match Option.bind advice (fun row -> number (field "usage_fcst" row)) with
        | Some n when n >= 0. && n <= 3. -> `Int (int_of_float n) | _ -> `Null);
      "guidancePublishedAt", json_time (Option.bind advice (timestamp "publication_ts_utc"))
    ])
