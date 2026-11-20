(* Only complete, validated disk hits may bypass source loading. Revalidation,
   errors and freshly downloaded data keep their own delivery metadata. *)
type stamp = { inode : int; size : int; modified : float }
type entry = { stamps : stamp list; expires : float; body : string }
type t = { capacity : int; mutable entries : (string * entry) list }

let create ~capacity = {capacity; entries=[]}

let stamps paths =
  try Some (List.map (fun path ->
    let s = Unix.stat path in
    {inode=s.st_ino; size=s.st_size; modified=s.st_mtime}) paths)
  with Unix.Unix_error _ -> None

let remember cache key entry =
  cache.entries <- List.take cache.capacity ((key, entry) :: List.remove_assoc key cache.entries)

let load cache ~date ~paths ~now ~assemble =
  let before = stamps paths in
  match List.assoc_opt date cache.entries, before with
  | Some entry, Some stamps when entry.expires > now () && stamps = entry.stamps ->
      remember cache date entry;
      Lwt.return entry.body
  | _ ->
      cache.entries <- List.remove_assoc date cache.entries;
      Lwt.map (fun (body, expires) ->
        (* Another request may publish a revision while this one waits for a feed. *)
        (match before, expires with
         | Some stamps_before, Some expires when expires > now () && stamps paths = before ->
             remember cache date {stamps=stamps_before; expires; body}
         | _ -> ());
        body) (assemble ())
