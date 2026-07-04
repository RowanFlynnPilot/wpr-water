"""Pull the public water system inventory for the 6-county coverage area
from EPA SDWIS via the Envirofacts REST API.

Endpoint: https://data.epa.gov/efservice/
Join query: GEOGRAPHIC_AREA (county served) -> WATER_SYSTEM.
Federal SDWIS refreshes quarterly from state submissions, so identity
fields here can lag DNR by up to a quarter.

Output: data/raw/sdwis_water_systems.json
"""

import json
import time
from pathlib import Path

import requests

BASE_URL = "https://data.epa.gov/efservice"
USER_AGENT = "wpr-water/0.1 (https://github.com/RowanFlynnPilot/wpr-water)"

COUNTIES = ["Langlade", "Lincoln", "Marathon", "Portage", "Shawano", "Taylor"]

OUTPUT_PATH = Path("data/raw/sdwis_water_systems.json")


def fetch_county(county: str) -> list[dict]:
    url = (
        f"{BASE_URL}/GEOGRAPHIC_AREA/COUNTY_SERVED/=/{county}"
        f"/STATE_SERVED/=/WI/WATER_SYSTEM/JSON"
    )
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=300)
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list):
        raise RuntimeError(f"{county}: unexpected response shape {type(rows)}")
    return rows


def main() -> None:
    by_pwsid: dict[str, dict] = {}
    for county in COUNTIES:
        rows = fetch_county(county)
        if not rows:
            raise RuntimeError(f"{county}: zero water systems returned")
        for r in rows:
            r["_county_served"] = county
            by_pwsid[r["pwsid"]] = r  # dedupe across county-area row types
        print(f"{county}: {len(rows)} rows")
        time.sleep(1)

    systems = list(by_pwsid.values())
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(systems, indent=1))
    print(f"Wrote {len(systems)} unique water systems to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
