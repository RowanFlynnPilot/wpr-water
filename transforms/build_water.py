"""Build widget-ready JSON from raw scraper output.

Inputs (data/raw/):
  dws_pfas_results.json     DNR DWS PFAS sample results (raw ng/L, all analytes)
  sdwis_water_systems.json  EPA SDWIS system inventory
  sdwis_violations.json     EPA SDWIS violations (all contaminant types)
Plus data/editorial.yaml    Human-curated per-system narratives.

Join key: EPA PWSID = "WI" + DNR PwsId[:7] (DNR's 8th digit is a check digit).
Verified against Wausau/Antigo/Merrill/Weston waterworks 2026-07-04.

Outputs (data/processed/):
  pfas_results.json  Slim per-sample records for trend charts
  systems.json       One record per system: identity + PFAS status + violations
  summary.json       Build metadata, thresholds, county rollups

Editorial policy (binding):
  - This tool reports DNR-recorded results and EPA-recorded violations. It
    never computes its own violation determinations; MCL compliance is a
    running-annual-average calculation that belongs to regulators.
  - Non-detects carry value null, never 0. "Between LOD and LOQ" results
    keep their qualifier so the UI can label them as trace/estimated.
"""

import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import yaml

RAW = Path("data/raw")
PROCESSED = Path("data/processed")
EDITORIAL_PATH = Path("data/editorial.yaml")

# Key analytes surfaced on system cards. Order = display order.
KEY_ANALYTES = ["PFOA", "PFOS", "PFAS Hazard Index", "PFHXS", "PFNA", "HFPO-DA", "PFBS"]

# Regulatory reference values (ng/L). Displayed as labeled reference lines,
# never as violation determinations. Verified 2026-07-04.
THRESHOLDS = {
    "wi_combined_pfoa_pfos": {
        "value": 70,
        "label": "Wisconsin enforceable standard, PFOA + PFOS combined (NR 809, Aug 2022)",
    },
    "federal_mcl_pfoa": {
        "value": 4.0,
        "label": "Federal MCL, PFOA (April 2024 rule; compliance 2029, proposed extension to 2031)",
    },
    "federal_mcl_pfos": {
        "value": 4.0,
        "label": "Federal MCL, PFOS (April 2024 rule; compliance 2029, proposed extension to 2031)",
    },
    "federal_hazard_index": {
        "value": 1.0,
        "label": "Federal Hazard Index MCL (proposed for rescission, May 2026)",
    },
}


def epa_pwsid(dnr_pws_id: str) -> str:
    if len(dnr_pws_id) != 8 or not dnr_pws_id.isdigit():
        raise ValueError(f"unexpected DNR PWS ID format: {dnr_pws_id}")
    return "WI" + dnr_pws_id[:7]


def parse_result(row: dict) -> dict:
    qualifier = row["ResultQualifierCode"]
    value = None if qualifier == "Non-detect" else float(row["ResultAmt"])
    return {
        "pws_id_dnr": row["PwsId"],
        "pwsid": epa_pwsid(row["PwsId"]),
        "analyte": row["ContamDesc"],
        "value": value,
        "units": row["UnitsText"],
        "qualifier": qualifier,
        "lod": row["LodText"],
        "loq": row["LoqText"],
        "date": row["SampleDate"][:10],
        "sample_type": row["SampleTypeDesc"],
        "source_id": row["EpaSourceId"],
        "source_code": row["SampleSourceCode"],
        "seq_no": row["SampleResultSeqNo"],
    }


def summarize_pfas(results: list[dict]) -> dict:
    """Per-system PFAS block: latest and max per key analyte, combined PFOA+PFOS."""
    by_analyte: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        by_analyte[r["analyte"]].append(r)

    latest, historic_max = {}, {}
    for analyte in KEY_ANALYTES:
        rows = sorted(by_analyte.get(analyte, []), key=lambda r: r["date"])
        if not rows:
            continue
        last = rows[-1]
        latest[analyte] = {
            "value": last["value"], "units": last["units"],
            "date": last["date"], "qualifier": last["qualifier"],
        }
        detected = [r for r in rows if r["value"] is not None]
        if detected:
            top = max(detected, key=lambda r: r["value"])
            historic_max[analyte] = {
                "value": top["value"], "units": top["units"], "date": top["date"],
            }

    # Latest combined PFOA+PFOS (vs WI 70 ng/L): sum of same-date latest values,
    # non-detects contribute 0 to the sum but are reported as null individually.
    combined = None
    if "PFOA" in latest or "PFOS" in latest:
        combined = round(
            (latest.get("PFOA", {}).get("value") or 0)
            + (latest.get("PFOS", {}).get("value") or 0),
            2,
        )

    # Detections outside the key-analyte panel (e.g. PFHxA, PFBA), max per analyte.
    other_detections = []
    for analyte, rows in sorted(by_analyte.items()):
        if analyte in KEY_ANALYTES:
            continue
        detected = [r for r in rows if r["value"] is not None]
        if detected:
            top = max(detected, key=lambda r: r["value"])
            other_detections.append({
                "analyte": analyte, "max_value": top["value"],
                "units": top["units"], "date": top["date"],
            })
    other_detections.sort(key=lambda d: -d["max_value"])

    dates = sorted(r["date"] for r in results)
    return {
        "sampled": True,
        "first_sample_date": dates[0],
        "latest_sample_date": dates[-1],
        "n_results": len(results),
        "n_detections": sum(1 for r in results if r["value"] is not None),
        "latest": latest,
        "historic_max": historic_max,
        "latest_combined_pfoa_pfos": combined,
        "other_detections": other_detections,
    }


# Most recent violations carried per system; the rest are summarized in counts.
VIOLATION_DETAIL_CAP = 12


def summarize_violations(violations: list[dict]) -> dict:
    categories: dict[str, int] = defaultdict(int)
    for v in violations:
        categories[v["violation_category_code"]] += 1
    # Unresolved = no return-to-compliance date. Verified against the data
    # 2026-07-04: status codes R/I always carry rtc_date, O/K never do.
    unresolved = [v for v in violations if not v["rtc_date"]]
    unresolved_hb = [v for v in unresolved if v["is_health_based_ind"] == "Y"]
    dates = sorted(
        v["compl_per_begin_date"][:10] for v in violations if v["compl_per_begin_date"]
    )

    by_recent = sorted(violations, key=lambda v: v["compl_per_begin_date"], reverse=True)
    detail = [
        {
            "begin_date": v["compl_per_begin_date"][:10],
            "category": v["violation_category_code"],
            "health_based": v["is_health_based_ind"] == "Y",
            "resolved": bool(v["rtc_date"]),
            "rtc_date": v["rtc_date"][:10] if v["rtc_date"] else None,
            "rule_code": v["rule_code"],
            "contaminant_code": v["contaminant_code"],
            "pn_tier": v["public_notification_tier"],
        }
        for v in by_recent[:VIOLATION_DETAIL_CAP]
    ]

    return {
        "total": len(violations),
        "health_based": sum(1 for v in violations if v["is_health_based_ind"] == "Y"),
        "unresolved": len(unresolved),
        "unresolved_health_based": len(unresolved_hb),
        "since_2020": sum(1 for d in dates if d >= "2020-01-01"),
        "latest_date": dates[-1] if dates else None,
        "oldest_unresolved_date": min(
            (v["compl_per_begin_date"][:10] for v in unresolved), default=None
        ),
        "oldest_unresolved_hb_date": min(
            (v["compl_per_begin_date"][:10] for v in unresolved_hb), default=None
        ),
        "categories": dict(categories),
        "detail": detail,
        "detail_omitted": max(0, len(violations) - VIOLATION_DETAIL_CAP),
    }


def main() -> None:
    raw_results = json.loads((RAW / "dws_pfas_results.json").read_text())
    sdwis_systems = json.loads((RAW / "sdwis_water_systems.json").read_text())
    raw_violations = json.loads((RAW / "sdwis_violations.json").read_text())
    editorial = yaml.safe_load(EDITORIAL_PATH.read_text()) or {}

    results = [parse_result(r) for r in raw_results]

    results_by_pwsid: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        results_by_pwsid[r["pwsid"]].append(r)

    violations_by_pwsid: dict[str, list[dict]] = defaultdict(list)
    for v in raw_violations:
        violations_by_pwsid[v["pwsid"]].append(v)

    # DNR identity fields for systems with PFAS results (fresher than SDWIS)
    dnr_identity: dict[str, dict] = {}
    for row in raw_results:
        pid = epa_pwsid(row["PwsId"])
        dnr_identity[pid] = {
            "pws_id_dnr": row["PwsId"],
            "name": row["PwsName"],
            "county": row["CountyName"],
            "type": row["PwsTypeDesc"],
            "population": int(row["Population"]) if row["Population"] else None,
            "status": row["DsStatusDesc"],
        }

    systems = []
    for s in sdwis_systems:
        pid = s["pwsid"]
        has_pfas = pid in results_by_pwsid
        if s["pws_activity_code"] != "A" and not has_pfas:
            continue
        dnr = dnr_identity.get(pid, {})
        record = {
            "pwsid": pid,
            "pws_id_dnr": dnr.get("pws_id_dnr"),
            "name": dnr.get("name") or s["pws_name"],
            "county": dnr.get("county") or s["_county_served"],
            "type_code": s["pws_type_code"],
            "type": dnr.get("type"),
            "population": dnr.get("population") or (
                int(s["population_served_count"]) if s["population_served_count"] else None
            ),
            "city_served": s["city_served"],
            "owner_type_code": s["owner_type_code"],
            "primary_source_code": s["primary_source_code"],
            "active": s["pws_activity_code"] == "A",
            "pfas": summarize_pfas(results_by_pwsid[pid]) if has_pfas else {"sampled": False},
            "violations": summarize_violations(violations_by_pwsid.get(pid, [])),
        }
        if dnr.get("pws_id_dnr") in editorial:
            record["editorial"] = editorial[dnr["pws_id_dnr"]]
        systems.append(record)

    orphans = set(results_by_pwsid) - {s["pwsid"] for s in systems}
    if orphans:
        raise RuntimeError(f"PFAS results for systems missing from SDWIS inventory: {orphans}")

    systems.sort(key=lambda s: (s["county"], -(s["population"] or 0)))

    county_rollup: dict[str, dict] = defaultdict(
        lambda: {"systems": 0, "sampled_for_pfas": 0, "with_pfas_detections": 0,
                 "with_unresolved_violations": 0,
                 "population_served": 0, "population_pfas_sampled": 0}
    )
    for s in systems:
        c = county_rollup[s["county"]]
        c["systems"] += 1
        # Population coverage counts active systems only. Populations of
        # overlapping systems (e.g. a school inside a city) can double-count;
        # this is a served-population figure, not a census one.
        pop = (s["population"] or 0) if s["active"] else 0
        c["population_served"] += pop
        if s["pfas"]["sampled"]:
            c["sampled_for_pfas"] += 1
            c["population_pfas_sampled"] += pop
            if s["pfas"]["n_detections"] > 0:
                c["with_pfas_detections"] += 1
        if s["violations"]["unresolved"] > 0:
            c["with_unresolved_violations"] += 1

    summary = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "thresholds": THRESHOLDS,
        "counts": {
            "systems": len(systems),
            "pfas_results": len(results),
            "violations": len(raw_violations),
        },
        "counties": dict(sorted(county_rollup.items())),
        "data_notes": {
            "dws": "DNR DWS portal data, current as of ~10 p.m. the prior day.",
            "sdwis": "EPA SDWIS federal data refreshes quarterly; violations can lag DNR records.",
            "non_detects": "Non-detect results carry value null; qualifier and LOD are preserved.",
        },
    }

    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / "pfas_results.json").write_text(json.dumps(results))
    (PROCESSED / "systems.json").write_text(json.dumps(systems, indent=1))
    (PROCESSED / "summary.json").write_text(json.dumps(summary, indent=1))
    print(f"systems: {len(systems)} | pfas results: {len(results)} | violations: {len(raw_violations)}")
    for county, c in sorted(county_rollup.items()):
        print(f"  {county:10} systems:{c['systems']:4}  sampled:{c['sampled_for_pfas']:4}  "
              f"detections:{c['with_pfas_detections']:4}  unresolved viol:{c['with_unresolved_violations']:3}")


if __name__ == "__main__":
    main()
