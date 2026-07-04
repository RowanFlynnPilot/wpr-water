"""Pull nitrate, arsenic, lead and copper sample results for the 6-county
coverage area from the DNR DWS public portal.

Same verified endpoint and DataTables envelope as dws_pfas_results (the
builder lives there); only the contaminant codes and date window differ.
Codes verified against the portal's Contam select 2026-07-04:
Nitrate NO3-N=1040, Arsenic=1005, Lead=1030, Copper=1022.

Volume is far higher than PFAS (lead/copper are individual tap samples),
so requests are one (county, contaminant) slice at a time with a bounded
date window.

Output: data/raw/dws_chem_results.json
"""

import json
import time
from pathlib import Path

from scrapers.dws_pfas_results import COUNTIES, fetch_county

# Portal contaminant codes -> canonical widget key. Verified 2026-07-04.
CHEM_ANALYTES = {
    "1040": "nitrate",
    "1005": "arsenic",
    "1030": "lead",
    "1022": "copper",
}

# Recent-history window: enough for a trend, bounded for volume.
SAMPLE_DATE_START = "01/01/2020"

OUTPUT_PATH = Path("data/raw/dws_chem_results.json")


def main() -> None:
    all_rows: list[dict] = []
    for county_code, county_name in COUNTIES.items():
        for contam_code, key in CHEM_ANALYTES.items():
            rows = fetch_county(county_code, [contam_code], SAMPLE_DATE_START)
            print(f"{county_name} {key}: {len(rows)} results")
            all_rows.extend(rows)
            time.sleep(2)

    if not all_rows:
        raise RuntimeError("chem pull returned zero rows across all slices")
    seq_nos = [r["SampleResultSeqNo"] for r in all_rows]
    if len(seq_nos) != len(set(seq_nos)):
        raise RuntimeError("duplicate SampleResultSeqNo across chem slices")

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(all_rows, indent=1))
    print(f"Wrote {len(all_rows)} chem results to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
