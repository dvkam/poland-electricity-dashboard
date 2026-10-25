let iso seconds =
  match Ptime.of_float_s seconds with
  | Some time -> Ptime.to_rfc3339 ~frac_s:0 ~tz_offset_s:0 time
  | None -> invalid_arg "Invalid timestamp"

let parse_utc value =
  let value = String.trim value in
  let normalized =
    if String.contains value 'T' then value
    else if String.length value >= 16 then
      String.sub value 0 10 ^ "T" ^ String.sub value 11 (String.length value - 11)
      ^ (if String.length value = 16 then ":00Z" else "Z")
    else value
  in
  match Ptime.of_rfc3339 normalized with
  | Ok (time, _, _) -> Some (Ptime.to_float_s time)
  | Error _ -> None

let date_parts date =
  try
    if String.length date <> 10 || date.[4] <> '-' || date.[7] <> '-'
       || not (String.for_all (fun c -> (c >= '0' && c <= '9') || c = '-') date) then None
    else
      let year = int_of_string (String.sub date 0 4)
      and month = int_of_string (String.sub date 5 2)
      and day = int_of_string (String.sub date 8 2) in
      match Ptime.of_date (year, month, day) with
      | Some _ -> Some (year, month, day)
      | None -> None
  with Failure _ -> None

let utc_midnight date =
  match date_parts date with
  | Some parts -> Option.map Ptime.to_float_s (Ptime.of_date parts)
  | None -> None

let last_sunday year month =
  match Ptime.of_date (year, month, 31) with
  | None -> invalid_arg "DST month"
  | Some time -> 31 - (Unix.gmtime (Ptime.to_float_s time)).tm_wday

(* Warsaw's EU DST rules apply to the supported date range, 2024 onward.
   Midnight precedes the spring change and precedes the autumn change. *)
let midnight_offset year month day =
  if (month > 3 && month < 10)
     || (month = 3 && day > last_sunday year 3)
     || (month = 10 && day <= last_sunday year 10)
  then 7200. else 3600.

let date_of_utc seconds = String.sub (iso seconds) 0 10

let bounds date =
  match date_parts date, utc_midnight date with
  | Some (year, month, day), Some midnight ->
      let next_date = date_of_utc (midnight +. 86400.) in
      (match date_parts next_date with
       | Some (ny, nm, nd) ->
           Some (midnight -. midnight_offset year month day,
                 midnight +. 86400. -. midnight_offset ny nm nd)
       | None -> None)
  | _ -> None

let today now =
  let year = (Unix.gmtime now).tm_year + 1900 in
  let transition month =
    match Ptime.of_date (year, month, last_sunday year month) with
    | Some time -> Ptime.to_float_s time +. 3600.
    | None -> assert false
  in
  date_of_utc (now +. if now >= transition 3 && now < transition 10 then 7200. else 3600.)

let slots date =
  match bounds date with
  | None -> []
  | Some (start, finish) ->
      List.init (int_of_float ((finish -. start) /. 900.))
        (fun index -> start +. float_of_int index *. 900.)
