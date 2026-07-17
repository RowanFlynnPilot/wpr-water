"""Pull open DNR cleanup activities (BRRTS) for the 6-county coverage area
from the RR Sites Map public ArcGIS service.

Layer 101 = Open Activity points (ERP, LUST, spills, etc.), the "why"
behind local water stories — Wauleco has been an open activity here since
1984. The layer has no county field; BRRTS activity numbers encode the
county in digits 3-4 (e.g. 0237... = Marathon 37), so we filter with LIKE
patterns per county code.

No substance/contaminant field exists in this layer, so activities are
reported as DNR records them — cleanup activities of all types, not
PFAS-specific.

Output: data/raw/dnr_brrts_sites.json
"""

import json
from pathlib import Path

import requests

LAYER_URL = (
    "https://dnrmaps.wi.gov/arcgis/rest/services/RR_Sites_Map/"
    "RR_PUBLIC_MAPSERVICES_CORE_EXT/MapServer/101/query"
)
USER_AGENT = "wpr-water/0.1 (https://github.com/RowanFlynnPilot/wpr-water)"

COUNTY_CODES = ["34", "35", "37", "44", "50", "59", "61", "72"]

OUTPUT_PATH = Path("data/raw/dnr_brrts_sites.json")


def main() -> None:
    where = " OR ".join(f"ACTIVITY_DETAIL_NO LIKE '__{c}%'" for c in COUNTY_CODES)
    response = requests.get(
        LAYER_URL,
        params={
            "f": "json",
            "where": where,
            "outFields": "ACTIVITY_DETAIL_NO,ACTIVITY_DETAIL_NAME,ACT_CODE,"
                         "LOC_ADDR,LOC_CITY,START_DATE,HAS_CONTINUING_OBLIGATION",
            "returnGeometry": "false",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=300,
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise RuntimeError(payload["error"])
    if payload.get("exceededTransferLimit"):
        raise RuntimeError("exceeded transfer limit, needs paging")

    rows = [f["attributes"] for f in payload["features"]]
    if not rows:
        raise RuntimeError("no open BRRTS activities returned for the coverage area")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(rows, indent=1))
    print(f"Wrote {len(rows)} open BRRTS activities to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
