"""Pull Safe Drinking Water Act violations for the 6-county coverage area
from EPA SDWIS via the Envirofacts REST API.

Join query: GEOGRAPHIC_AREA (county served) -> VIOLATION. Covers all
regulated contaminants (bacteria, nitrate, lead/copper, DBPs, radionuclides,
monitoring/reporting failures), not just PFAS. This is the source for the
"small systems quietly racking up violations" angle.

Note: federal SDWIS refreshes quarterly from state submissions, so recent
violations can lag DNR's own records by up to a quarter. The widget must
label violation data with its refresh cadence.

Output: data/raw/sdwis_violations.json
"""

import json
import time
from pathlib import Path

import requests

BASE_URL = "https://data.epa.gov/efservice"
USER_AGENT = "wpr-water/0.1 (https://github.com/RowanFlynnPilot/wpr-water)"

COUNTIES = ["Langlade", "Lincoln", "Marathon", "Oneida", "Portage", "Shawano", "Taylor", "Wood"]

OUTPUT_PATH = Path("data/raw/sdwis_violations.json")


def fetch_county(county: str) -> list[dict]:
    url = (
        f"{BASE_URL}/GEOGRAPHIC_AREA/COUNTY_SERVED/=/{county}"
        f"/STATE_SERVED/=/WI/VIOLATION/JSON"
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
            key = (r["pwsid"], r["violation_id"])
            seen[key] = r  # dedupe across county-area row types
        print(f"{county}: {len(rows)} violation rows")
        time.sleep(1)

    violations = list(seen.values())
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(violations, indent=1))
    print(f"Wrote {len(violations)} unique violations to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
