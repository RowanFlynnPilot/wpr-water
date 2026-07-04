"""Pull all PFAS sample results for the 6-county coverage area from the
Wisconsin DNR Drinking Water System (DWS) public portal.

Endpoint: POST https://apps.dnr.wi.gov/dwsportalpub/api/contamresults
This is the JSON API behind the portal's "Contaminants" search page
(DataTables server-side processing). No auth or anti-forgery token required.
Data is current as of ~10 p.m. the prior day per DNR.

One request per county with the full 34-analyte PFAS panel, length=-1
(server returns all rows). Includes non-detects so downstream code can
distinguish "sampled, not detected" from "never sampled".

Output: data/raw/dws_pfas_results.json
"""

import json
import time
from pathlib import Path

import requests

API_URL = "https://apps.dnr.wi.gov/dwsportalpub/api/contamresults"
USER_AGENT = "wpr-water/0.1 (https://github.com/RowanFlynnPilot/wpr-water)"

# DNR county codes from the portal's County select. Verified 2026-07-04.
COUNTIES = {
    "34": "Langlade",
    "35": "Lincoln",
    "37": "Marathon",
    "50": "Portage",
    "59": "Shawano",
    "61": "Taylor",
}

# Full PFAS panel from the portal's Contam select. Verified 2026-07-04.
# X157 is DNR's computed PFAS Hazard Index (DHS methodology).
PFAS_ANALYTES = {
    "2806": "PFOA", "2805": "PFOS", "2803": "PFHXS", "2804": "PFNA",
    "2801": "PFBS", "2816": "HFPO-DA", "X157": "PFAS Hazard Index",
    "2819": "PFBA", "2802": "PFHPA", "2829": "PFHPS", "2809": "PFHXA",
    "2807": "PFDA", "2808": "PFDOA", "X136": "PFDOS", "X139": "PFDS",
    "X151": "PFNS", "2824": "PFPEA", "2828": "PFPES", "2810": "PFTEA",
    "2811": "PFTRIA", "2812": "PFUNA", "2813": "11CL-PF3OUDS",
    "2814": "9CL-PF3ONS", "2815": "DONA", "2820": "6:2 FTSA",
    "2821": "4:2 FTSA", "2822": "8:2 FTSA", "X156": "FOSA",
    "X130": "NETFOSA", "X132": "N-ETFOSE", "X133": "NMEFOSA",
    "X135": "N-MEFOSE", "2817": "NETFOSAA", "2818": "NMEFOSAA",
}

# Earliest PFAS lab data of interest. Wausau's first voluntary tests were 2019.
SAMPLE_DATE_START = "01/01/2019"

OUTPUT_PATH = Path("data/raw/dws_pfas_results.json")


def _datatables_params(county_code: str) -> list[tuple[str, str]]:
    """Build the DataTables server-side POST body the endpoint requires."""
    cols = ["ContamDesc", "ResultAmt"]  # server returns full row model regardless
    params: list[tuple[str, str]] = [("draw", "1")]
    for i, c in enumerate(cols):
        params += [
            (f"columns[{i}][data]", c),
            (f"columns[{i}][name]", ""),
            (f"columns[{i}][searchable]", "true"),
            (f"columns[{i}][orderable]", "true"),
            (f"columns[{i}][search][value]", ""),
            (f"columns[{i}][search][regex]", "false"),
        ]
    params += [
        ("order[0][column]", "1"),
        ("order[0][dir]", "asc"),
        ("start", "0"),
        ("length", "-1"),  # all rows
        ("search[value]", ""),
        ("search[regex]", "false"),
    ]
    params += [("Contam[]", code) for code in PFAS_ANALYTES]
    params += [
        ("County[]", county_code),
        ("DetectsOnly", "false"),
        ("MCLExceedancesOnly", "false"),
        ("SampleDateStart", SAMPLE_DATE_START),
        ("SampleDateEnd", ""),
        ("PWSNameOrID", ""),
        ("ResultAmtLow", ""),
        ("ResultAmtHigh", ""),
    ]
    return params


def fetch_county(county_code: str) -> list[dict]:
    response = requests.post(
        API_URL,
        data=_datatables_params(county_code),
        headers={"User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest"},
        timeout=300,
    )
    response.raise_for_status()
    payload = response.json()
    rows = payload["data"]
    if payload["recordsTotal"] != len(rows):
        raise RuntimeError(
            f"county {county_code}: recordsTotal {payload['recordsTotal']} "
            f"!= rows returned {len(rows)}"
        )
    return rows


def main() -> None:
    all_rows: list[dict] = []
    for code, name in COUNTIES.items():
        rows = fetch_county(code)
        if not rows:
            raise RuntimeError(f"county {name} returned zero PFAS results")
        print(f"{name}: {len(rows)} results")
        all_rows.extend(rows)
        time.sleep(2)

    seq_nos = [r["SampleResultSeqNo"] for r in all_rows]
    if len(seq_nos) != len(set(seq_nos)):
        raise RuntimeError("duplicate SampleResultSeqNo across counties")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(all_rows, indent=1))
    print(f"Wrote {len(all_rows)} PFAS results to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
