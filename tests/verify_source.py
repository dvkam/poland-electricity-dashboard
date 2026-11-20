"""Compare a dashboard day JSON file with the original Energy-Charts and PSE records.

Run with Python 3.11+ from WSL. Both the raw fixture directory and a dashboard
DATA_DIR containing dated cache envelopes are supported.
"""
import argparse
import json
import math
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo


def utc(value):
    stamp = datetime.fromisoformat(value)
    return (stamp if stamp.tzinfo else stamp.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def source(directory, feed, date):
    raw = directory / f"{feed}.json"
    if raw.exists():
        return json.loads(raw.read_text())
    prefix = "generation-v2" if feed == "generation" else feed
    return json.loads((directory / f"{prefix}-{date}.json").read_text())["payload"]


def latest(rows, *, borders=False):
    readings = {}
    for row in rows:
        if row.get("is_active", True) is not True:
            continue
        instant = utc(row["dtime_utc"])
        key = (instant, row["section_code"]) if borders else instant
        if key not in readings or utc(row["publication_ts_utc"]) > utc(readings[key]["publication_ts_utc"]):
            readings[key] = row
    return readings


def total(values):
    return None if any(n is None for n in values) else sum(values)


def verify(day, directory):
    date = day["date"]
    power = source(directory, "generation", date)
    if (power["country"], power["endpoint"], power["unit"]) != ("pl", "public_power", "MW"):
        raise ValueError("Unexpected provider, country or unit for generation")
    span = timedelta(minutes=power["interval_minutes"])
    productions = {utc(r["timestamp"]): r["values"] for r in power["data"]}
    prices = latest(source(directory, "prices", date)["value"])
    guidance = latest(source(directory, "guidance", date)["value"])
    flows = latest(source(directory, "flows", date)["value"], borders=True)
    categories = {
        "coal": ["fossil_hard_coal"], "lignite": ["fossil_brown_coal_lignite"],
        "gas": ["fossil_gas", "fossil_coal_derived_gas"], "wind": ["wind_onshore", "wind_offshore"],
        "solar": ["solar"], "hydro": ["hydro_run_of_river", "hydro_water_reservoir"],
        "biomass": ["biomass"], "storage": ["hydro_pumped_storage", "battery"],
        "other": ["others", "fossil_oil", "other_renewables"],
    }
    declared = {entry["id"] for entry in power["series"]}
    if date == "2024-06-14":
        # Before these series were published, as documented for this archive.
        for group in ("wind", "storage"):
            categories[group] = [key for key in categories[group] if key in declared]
    known = set().union(*categories.values(), {"load", "residual_load", "cross_border_electricity_trading",
        "renewable_share_of_generation", "renewable_share_of_load", "hydro_pumped_storage_consumption",
        "battery_consumption"})
    count = 0

    def check(field, expected, observed):
        nonlocal count
        if expected != observed and not (isinstance(expected, (int, float)) and isinstance(observed, (int, float))
                                         and math.isclose(expected, observed, abs_tol=1e-6, rel_tol=0)):
            raise ValueError(f"{date} {point['start']} {field}: expected {expected!r}, received {observed!r}")
        count += 1

    zone = ZoneInfo("Europe/Warsaw")
    calendar_date = datetime.fromisoformat(date).date()
    start = datetime.combine(calendar_date, time(), zone).astimezone(timezone.utc)
    stop = datetime.combine(calendar_date + timedelta(days=1), time(), zone).astimezone(timezone.utc)
    quarter = timedelta(minutes=15)
    if len(day["points"]) != (stop - start) // quarter:
        raise ValueError(f"Incomplete Warsaw time axis for {date}")
    for i, point in enumerate(day["points"]):
        t = start + i * quarter
        end = t + quarter
        if utc(point["start"]) != t or utc(point["end"]) != end:
            raise ValueError(f"Wrong quarter at index {i}")
        gen_start = start + ((t - start) // span) * span
        v = productions.get(gen_start, {})
        for key, expected in [("generationStart", gen_start), ("generationEnd", gen_start + span)]:
            check(key, expected if gen_start in productions else None, utc(point[key]) if point[key] else None)
        mix = {group: total([v.get(key) for key in keys]) for group, keys in categories.items()}
        for group, expected in mix.items():
            check(group, expected, point["generation"][group])
        check("generationMw", total(mix.values()) if declared <= known else None, point["generationMw"])
        check("demandMw", v.get("load"), point["demandMw"])
        check("renewablePercent", v.get("renewable_share_of_generation"), point["renewablePercent"])
        pumping = v.get("hydro_pumped_storage_consumption")
        check("pumpingMw", abs(pumping) if pumping is not None else None, point["pumpingMw"])
        check("rcePlnMwh", prices.get(end, {}).get("rce_pln"), point["rcePlnMwh"])
        check("guidance", guidance.get(t.replace(minute=0), {}).get("usage_fcst"), point["guidance"])
        nets = []
        borders = {row["country"]: row for row in point["flows"]}
        for country in ("DE", "CZ", "LT", "SK", "UA", "SE"):
            inbound = flows.get((end, country + "-PL"), {})
            outbound = flows.get((end, "PL-" + country), {})
            incoming = inbound.get("value")
            outgoing = outbound.get("value")
            net = total([incoming, outgoing])
            nets.append(net)
            for key, record in [("importPublishedAt", inbound), ("exportPublishedAt", outbound)]:
                actual = borders[country][key]
                check(f"{country}.{key}", utc(record["publication_ts_utc"]) if record else None,
                      utc(actual) if actual else None)
            latest_publication = (max(utc(inbound["publication_ts_utc"]), utc(outbound["publication_ts_utc"]))
                                  if net is not None else None)
            published = borders[country]["publishedAt"]
            check(f"{country}.publishedAt", latest_publication, utc(published) if published else None)
            for key, expected in [("importMw", incoming), ("exportMw", abs(outgoing) if outgoing is not None else None),
                                  ("signedImportMw", net)]:
                check(f"{country}.{key}", expected, borders[country][key])
        check("netImportMw", total(nets), point["netImportMw"])
    return count


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("day", type=Path, help="JSON body from /api/v1/day or the OCaml replay executable")
    parser.add_argument("sources", type=Path, help="directory holding the same editions of the raw responses")
    args = parser.parse_args()
    day = json.loads(args.day.read_text())
    print(f"{day['date']}: {verify(day, args.sources)} source comparisons passed")
