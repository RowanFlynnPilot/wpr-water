"""Pull EPA ECHO SDWA compliance rollups for the 6-county coverage area.

Two-step REST flow (verified 2026-07-04):
  1. GET sdw_rest_services.get_systems?p_st=WI&p_co={County} -> QueryID + row count
  2. GET sdw_rest_services.get_qid?qid={QueryID}&pageno=N    -> per-system rows

Adds EPA's precomputed judgment layer on top of the raw SDWIS violations we
already pull: the official Serious Violator designation, quarters-with-
violation / quarters-in-SNC counts, a 12-quarter compliance history string,
and last informal/formal enforcement dates. Same quarterly refresh cadence
as SDWIS federal data.

Note: p_pwsid is silently ignored by get_systems — county queries only.
QueryIDs are session-transient, so pages are pulled immediately.

Output: data/raw/echo_sdwa.json
"""

import json
import time
from pathlib import Path

import requests

BASE = "https://echodata.epa.gov/echo"
USER_AGENT = "wpr-water/0.1 (https://github.com/RowanFlynnPilot/wpr-water)"

COUNTIES = ["Langlade", "Lincoln", "Marathon", "Portage", "Shawano", "Taylor"]

OUTPUT_PATH = Path("data/raw/echo_sdwa.json")


def get_json(path: str, params: dict) -> dict:
    response = requests.get(
        f"{BASE}/{path}",
        params={"output": "JSON", **params},
        headers={"User-Agent": USER_AGENT},
        timeout=120,
    )
    response.raise_for_status()
    payload = response.json()["Results"]
    if payload.get("Error"):
        raise RuntimeError(f"{path}: {payload['Error']}")
    return payload


def fetch_county(county: str) -> list[dict]:
    head = get_json("sdw_rest_services.get_systems", {"p_st": "WI", "p_co": county})
    expected = int(head["QueryRows"])
    qid = head["QueryID"]

    rows: list[dict] = []
    page = 1
    while len(rows) < expected:
        payload = get_json("sdw_rest_services.get_qid", {"qid": qid, "pageno": page})
        got = payload["WaterSystems"]
        if not got:
            raise RuntimeError(
                f"{county}: page {page} empty at {len(rows)}/{expected} rows"
            )
        rows.extend(got)
        page += 1
        time.sleep(1)
    if len(rows) != expected:
        raise RuntimeError(f"{county}: got {len(rows)} rows, expected {expected}")
    return rows


def main() -> None:
    all_rows: list[dict] = []
    for county in COUNTIES:
        rows = fetch_county(county)
        print(f"{county}: {len(rows)} systems")
        all_rows.extend(rows)
        time.sleep(1)

    pwsids = [r["PWSId"] for r in all_rows]
    if len(pwsids) != len(set(pwsids)):
        raise RuntimeError("duplicate PWSId across county pulls")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(all_rows, indent=1))
    print(f"Wrote {len(all_rows)} ECHO rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
