"""Pull SDWA enforcement actions for the 6-county coverage area from EPA
SDWIS via the Envirofacts REST API.

Join query: GEOGRAPHIC_AREA (county served) -> ENFORCEMENT_ACTION, the same
pattern as sdwis_violations. Closes the loop on the compliance board: not
just that a system violated, but whether and when the state responded.

Action type codes (SIA/SIE/SIF etc.) are EPA's coded taxonomy; the widget
reports counts and dates rather than decoding categories it can't verify.

Output: data/raw/sdwis_enforcement.json
"""

import json
import time
from pathlib import Path

import requests

BASE_URL = "https://data.epa.gov/efservice"
USER_AGENT = "wpr-water/0.1 (https://github.com/RowanFlynnPilot/wpr-water)"

COUNTIES = ["Langlade", "Lincoln", "Marathon", "Portage", "Shawano", "Taylor"]

OUTPUT_PATH = Path("data/raw/sdwis_enforcement.json")


def fetch_county(county: str) -> list[dict]:
    url = (
        f"{BASE_URL}/GEOGRAPHIC_AREA/COUNTY_SERVED/=/{county}"
        f"/STATE_SERVED/=/WI/ENFORCEMENT_ACTION/JSON"
    )
    response = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=300)
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list):
        raise RuntimeError(f"{county}: unexpected response shape {type(rows)}")
    return rows


def main() -> None:
    seen: dict[tuple, dict] = {}
    for county in COUNTIES:
        rows = fetch_county(county)
        for r in rows:
            key = (r["pwsid"], r["enforcement_id"])
            seen[key] = r  # dedupe across county-area row types
        print(f"{county}: {len(rows)} enforcement rows")
        time.sleep(1)

    actions = list(seen.values())
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(actions, indent=1))
    print(f"Wrote {len(actions)} unique enforcement actions to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
