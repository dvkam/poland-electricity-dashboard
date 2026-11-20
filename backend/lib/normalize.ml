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

let production_ids = [
  "fossil_hard_coal", "Fossil hard coal"; "fossil_brown_coal_lignite", "Fossil brown coal / lignite";
  "fossil_gas", "Fossil gas"; "fossil_coal_derived_gas", "Fossil coal-derived gas";
  "wind_onshore", "Wind onshore"; "wind_offshore", "Wind offshore"; "solar", "Solar";
  "hydro_run_of_river", "Hydro Run-of-River"; "hydro_water_reservoir", "Hydro water reservoir";
  "biomass", "Biomass"; "hydro_pumped_storage", "Hydro pumped storage"; "battery", "Battery";
  "others", "Others"; "fossil_oil", "Fossil oil"; "other_renewables", "Other renewables"
]
let auxiliary_ids = [
  "load", "Load"; "renewable_share_of_generation", "Renewable share of generation";
  "hydro_pumped_storage_consumption", "Hydro pumped storage consumption";
  "battery_consumption", "Battery Consumption"; "cross_border_electricity_trading", "Trade";
  "residual_load", "Residual load"; "renewable_share_of_load", "Renewable share of load"
]

let public_power_v2 ~date payload =
  let minutes = number (field "interval_minutes" payload) in
  let resolution = string (field "resolution" payload) in
  if field "schema_version" payload <> `String "2.0"
     || field "country" payload <> `String "pl"
     || field "endpoint" payload <> `String "public_power"
     || field "unit" payload <> `String "MW"
     || not ((minutes = Some 15. && resolution = Some "PT15M")
          || (minutes = Some 60. && resolution = Some "PT1H")) then
    invalid_arg "Unexpected generation feed or resolution";
  let first, last = match Time.bounds date with
    | Some bounds -> bounds | None -> invalid_arg "Invalid generation date" in
  let duration = Option.get minutes *. 60. in
  let rows = list (field "data" payload) in
  let ids = list (field "series" payload) |> List.map (fun entry ->
    match string (field "id" entry) with Some id when id <> "" -> id | _ -> invalid_arg "Missing series id") in
  let sorted_ids = List.sort String.compare ids in
  if ids = [] || sorted_ids <> List.sort_uniq String.compare ids then invalid_arg "Invalid series inventory";
  let seen = Hashtbl.create 100 in
  let times = List.map (fun row ->
    let t = match timestamp "timestamp" row with
      | Some t when t >= first && t +. duration <= last && mod_float (t -. first) duration = 0.
                    && not (Hashtbl.mem seen t) -> t
      | _ -> invalid_arg "Invalid or repeated generation interval" in
    Hashtbl.add seen t ();
    (match field "values" row with
     | `Assoc fields when List.sort String.compare (List.map fst fields) = sorted_ids
                       && List.for_all (fun (_, v) -> v = `Null || Option.is_some (number v)) fields -> ()
     | _ -> invalid_arg "Invalid generation measurements");
    t) rows in
  let mapping = production_ids @ auxiliary_ids in
  let series = List.filter_map (fun id -> Option.map (fun name ->
    `Assoc ["name", `String name; "data", `List (List.map (fun row -> field id (field "values" row)) rows)]
  ) (List.assoc_opt id mapping)) ids in
  (* This archived day has a verified inventory without offshore wind or batteries.
     Sum only the published series for that day. Other omissions stay unknown. *)
  let archived_inventory = times <> [] && List.for_all (fun t -> Time.today t = "2024-06-14") times in
  let applicable id = not (archived_inventory && (id = "battery" || id = "wind_offshore") && not (List.mem id ids)) in
  let complete = List.for_all (fun (id, _) -> not (applicable id) || List.mem id ids) production_ids
    && List.for_all (fun id -> List.mem_assoc id mapping) ids in
  `Assoc ["unix_seconds", `List (List.map (fun t -> `Float t) times); "production_types", `List series;
    "reportedPumpedOnly", `Bool (not (applicable "battery"));
    "reportedOnshoreOnly", `Bool (not (applicable "wind_offshore"));
    "completeInventory", `Bool complete; "interval_minutes", json_number minutes]

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
        (* Battery was added by the provider later. Absence in older payloads
           means no reported series; an explicitly null value stays unknown. *)
        let mix = List.map (fun (key, names) ->
          let names = if key = "storage" && List.mem_assoc "Battery" types
            then "Battery" :: names
            else if key = "wind" && field "reportedOnshoreOnly" power = `Bool true then ["Wind onshore"]
            else names in
          let missing_battery = key = "storage" && field "completeInventory" power = `Bool false
            && not (List.mem_assoc "Battery" types) && field "reportedPumpedOnly" power <> `Bool true in
          key, (if missing_battery then None else sum (List.map get names))) groups in
        let total = if field "completeInventory" power = `Bool false then None else sum (List.map snd mix) in
        let share = match get "Renewable share of generation" with
          | Some n when n >= 0. && n <= 100. -> Some n | _ -> None in
        Hashtbl.replace points (int_of_float start) (mix, total, share, get "Load", get "Hydro pumped storage consumption")
  ) times;
  points

(* A section can publish several revisions for the same instant. Equal
   publication times retain the first source row, as in the original stable sort. *)
let index_revisions report key =
  let index = Hashtbl.create 128 in
  List.iter (fun row ->
    match timestamp "dtime_utc" row, Option.bind (string (field "publication_ts_utc" row)) Time.parse_time with
    | Some time, Some publication ->
        Option.iter (fun key -> match Hashtbl.find_opt index key with
          | Some (previous, _) when Ptime.compare publication previous <= 0 -> ()
          | _ -> Hashtbl.replace index key (publication, row)) (key time row)
    | _ -> ()) (list (field "value" report));
  fun key -> Option.map snd (Hashtbl.find_opt index key)

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
  let duration = match number (field "interval_minutes" power) with
    | Some 60. -> 3600. | _ -> 900. in
  let covered = Hashtbl.create 100 in
  Hashtbl.iter (fun timestamp value ->
    let start = float_of_int timestamp in
    for quarter = 0 to int_of_float (duration /. 900.) - 1 do
      Hashtbl.replace covered (timestamp + quarter * 900) (value, start, start +. duration)
    done) indexed;
  let flow_at = index_revisions flows (fun time row ->
    Option.map (fun section -> time, section) (string (field "section_code" row))) in
  let price_at = index_revisions prices (fun time _ -> Some time) in
  let guidance_at = index_revisions guidance (fun time row ->
    if field "is_active" row = `Bool true then Some time else None) in
  Time.slots date |> List.map (fun start ->
    let finish = start +. 900. in
    let (mix, total, renewable, demand, pumping), generation_start, generation_end =
      match Hashtbl.find_opt covered (int_of_float start) with
      | Some (point, first, last) -> point, Some first, Some last
      | None -> (List.map (fun (key, _) -> key, None) groups, None, None, None, None), None, None in
    let border_flows = List.map (fun country ->
      let incoming = flow_at (finish, country ^ "-PL") in
      let outgoing = flow_at (finish, "PL-" ^ country) in
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
    let price = price_at finish in
    let advice = guidance_at (start -. mod_float start 3600.) in
    `Assoc [
      "start", `String (Time.iso start); "end", `String (Time.iso finish);
      "generationStart", json_time generation_start; "generationEnd", json_time generation_end;
      "generation", `Assoc (List.map (fun (key, value) -> key, json_number value) mix);
      "generationMw", json_number total; "demandMw", json_number demand;
      "renewablePercent", json_number renewable;
      "pumpingMw", json_number (Option.map abs_float pumping);
      "netImportMw", json_number net; "flows", `List border_flows;
      "rcePlnMwh", json_number (Option.bind price (fun row -> number (field "rce_pln" row)));
      "pricePublishedAt", json_time (Option.bind price (timestamp "publication_ts_utc"));
      "guidance", (match Option.bind advice (fun row -> number (field "usage_fcst" row)) with
        | Some n when n >= 0. && n <= 3. && Float.floor n = n -> `Int (int_of_float n) | _ -> `Null);
      "guidancePublishedAt", json_time (Option.bind advice (timestamp "publication_ts_utc"))
    ])
