"""Pull county-level private-well water quality aggregates from the
UW-Stevens Point Center for Watershed Science and Education's Well Water
Quality Viewer (public ArcGIS Online feature services).

These are cumulative aggregates of voluntary homeowner samples since 1985 —
long-run context for the private-well blind spot, not current conditions,
and no PFAS parameters exist. Attribution: UWSP CWSE. The center notes the
viewer is no substitute for testing an individual well; the widget must
carry that disclaimer.

Layers (via the viewer's Config_PW_Layers table, verified 2026-07-04):
  County_Data/9  Nitrate    County_Data/2  Arsenic    County_Data/3  Bacteria

Output: data/raw/uwsp_private_wells.json
"""

import json
import time
from pathlib import Path

import requests

BASE = "https://services1.arcgis.com/kkX9mRo34fTGAX96/ArcGIS/rest/services/County_Data/FeatureServer"
USER_AGENT = "wpr-water/0.1 (https://github.com/RowanFlynnPilot/wpr-water)"

LAYERS = {"9": "nitrate", "2": "arsenic", "3": "bacteria"}

COUNTIES = {"Langlade", "Lincoln", "Marathon", "Portage", "Shawano", "Taylor"}

OUTPUT_PATH = Path("data/raw/uwsp_private_wells.json")


def fetch_layer(layer_id: str) -> list[dict]:
    response = requests.get(
        f"{BASE}/{layer_id}/query",
        params={"f": "json", "where": "1=1", "outFields": "*", "returnGeometry": "false"},
        headers={"User-Agent": USER_AGENT},
        timeout=120,
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise RuntimeError(f"layer {layer_id}: {payload['error']}")
    return [f["attributes"] for f in payload["features"]]


def main() -> None:
    out = []
    for layer_id, param in LAYERS.items():
        rows = fetch_layer(layer_id)
        kept = [
            r | {"_parameter": param}
            for r in rows
            if any(c.lower() in (r.get("Location") or "").lower() for c in COUNTIES)
        ]
        if len(kept) != len(COUNTIES):
            raise RuntimeError(
                f"{param}: expected {len(COUNTIES)} county rows, got {len(kept)} "
                f"(locations: {[r.get('Location') for r in rows[:5]]}...)"
            )
        print(f"{param}: {len(kept)} county rows")
        out.extend(kept)
        time.sleep(1)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(out, indent=1))
    print(f"Wrote {len(out)} rows to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
