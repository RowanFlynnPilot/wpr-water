"""Pull open PFAS contamination sites for the coverage area from DNR's
EM_PFAS public map service (layer 1: PFAS Sites, Open/Under Investigation).

Unlike the BRRTS RR Sites layer (all cleanup activity types, no substance
field), this layer is PFAS-specific and carries the contamination SOURCES
(industrial, firefighting foam, landfill...), affected MEDIA, and a BOTW
link whose activity number encodes the county in its middle pair
(e.g. "02-37-596321" = Marathon 37).

We query a WGS84 envelope over the 8 counties, then keep only sites whose
BOTW county code is one of ours (the envelope over-catches neighbours).

Output: data/raw/dnr_pfas_sites.json
"""

import json
import re
from pathlib import Path

import requests

from scrapers.dws_pfas_results import COUNTIES  # DNR county code -> name

LAYER_URL = (
    "https://dnrmaps.wi.gov/arcgis2/rest/services/EM_PFAS/"
    "EM_PFAS_MAPLAYERS_PUBLIC_EXT/MapServer/1/query"
)
USER_AGENT = "wpr-water/0.1 (https://github.com/RowanFlynnPilot/wpr-water)"

# Same envelope as dnr_fish_advisories (north to Oneida, south to Wood).
ENVELOPE = {"xmin": -90.93, "ymin": 44.05, "xmax": -88.24, "ymax": 45.95}

BOTW_CODE = re.compile(r"\((\d{2})-(\d{2})-(\d+)\)")
BOTW_HREF = re.compile(r'href="([^"]+)"')

OUTPUT_PATH = Path("data/raw/dnr_pfas_sites.json")


def main() -> None:
    response = requests.get(
        LAYER_URL,
        params={
            "f": "json",
            "where": "1=1",
            "geometry": json.dumps(ENVELOPE),
            "geometryType": "esriGeometryEnvelope",
            "inSR": "4326",
            "spatialRel": "esriSpatialRelIntersects",
            "outFields": "*",
            "returnGeometry": "false",
        },
        headers={"User-Agent": USER_AGENT},
        timeout=(30, 120),
    )
    response.raise_for_status()
    payload = response.json()
    if "error" in payload:
        raise RuntimeError(payload["error"])
    if payload.get("exceededTransferLimit"):
        raise RuntimeError("exceeded transfer limit, needs paging")

    kept, dropped = [], 0
    for feat in payload["features"]:
        a = feat["attributes"]
        botw = a.get("BOTW") or ""
        m = BOTW_CODE.search(botw)
        county_code = m.group(2) if m else None
        if county_code not in COUNTIES:
            dropped += 1
            continue
        href = BOTW_HREF.search(botw)
        # The link is rendered as an <a href> in the widget: only ever pass
        # through DNR's own BOTW host, whatever the attribute contains.
        url = href.group(1) if href else None
        if url and not url.startswith("https://apps.dnr.wi.gov/"):
            url = None
        kept.append({
            "name": a.get("SITENAME"),
            "county": COUNTIES[county_code],
            "sources": a.get("SOURCES"),
            "media": a.get("MEDIA"),
            "drinking_water_affected": a.get("DWA"),
            "status": a.get("SITE_STATUS"),
            "notes": a.get("NOTES"),
            "botw_url": url,
            "wtm_x": a.get("WTM_X"),
            "wtm_y": a.get("WTM_Y"),
        })

    if not kept:
        raise RuntimeError("no open PFAS sites matched the coverage counties")
    print(f"envelope hits: {len(payload['features'])} | kept (our counties): {len(kept)} "
          f"| dropped (neighbours/no BOTW code): {dropped}")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(kept, indent=1))
    print(f"Wrote {len(kept)} PFAS sites to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
