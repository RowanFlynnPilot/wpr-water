"""Pull PFAS-related fish consumption advisories for the coverage area from
the DNR EM_PFAS public map service.

Layers (verified 2026-07-04):
  801  PFAS fish consumption advice — waterbody areas
  803  PFAS fish consumption advice — stream/river lines

These are advisory *designations* (DNR/DHS consumption advice), not sample
values — a different, appropriate use of the EM_PFAS service than the
rejected municipal sampling layer (see CLAUDE.md).

The layers carry no county field, so we query with a bounding envelope over
the six-county region; waterbodies from adjacent-county fringes can appear
and are kept (rivers cross county lines anyway).

Output: data/raw/dnr_fish_advisories.json
"""

import json
import time
from pathlib import Path

import requests

SERVICE = (
    "https://dnrmaps.wi.gov/arcgis2/rest/services/EM_PFAS/"
    "EM_PFAS_MAPLAYERS_PUBLIC_EXT/MapServer"
)
LAYERS = {801: "waterbody", 803: "stream"}
USER_AGENT = "wpr-water/0.1 (https://github.com/RowanFlynnPilot/wpr-water)"

# WGS84 envelope over Marathon/Lincoln/Langlade/Taylor/Shawano/Portage.
ENVELOPE = {"xmin": -90.93, "ymin": 44.24, "xmax": -88.24, "ymax": 45.55}

OUTPUT_PATH = Path("data/raw/dnr_fish_advisories.json")


def fetch_layer(layer_id: int) -> list[dict]:
    params = {
        "f": "json",
        "where": "1=1",
        "geometry": json.dumps(ENVELOPE),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": "*",
        "returnGeometry": "false",
    }
    response = requests.get(
        f"{SERVICE}/{layer_id}/query",
        params=params,
        headers={"User-Agent": USER_AGENT},
        timeout=120,
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise RuntimeError(f"layer {layer_id}: {payload['error']}")
    if payload.get("exceededTransferLimit"):
        raise RuntimeError(f"layer {layer_id}: exceeded transfer limit, needs paging")
    return [feat["attributes"] for feat in payload["features"]]


def main() -> None:
    out = []
    for layer_id, kind in LAYERS.items():
        rows = fetch_layer(layer_id)
        print(f"layer {layer_id} ({kind}): {len(rows)} features")
        for r in rows:
            r["_layer"] = kind
        out.extend(rows)
        time.sleep(1)

    if not out:
        raise RuntimeError("no advisory features returned for the coverage envelope")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(out, indent=1))
    print(f"Wrote {len(out)} advisory features to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
