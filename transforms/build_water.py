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

# DWS chem pull: portal contaminant code -> canonical key (order = display order)
CHEM_KEYS = {"1040": "nitrate", "1005": "arsenic", "1030": "lead", "1022": "copper"}

# Labeled reference values for the chem panel. Lead and copper are action
# levels assessed at the 90th percentile of tap samples — never present a
# single sample against them as a violation.
CHEM_REFERENCES = {
    "nitrate": {"value": 10, "units": "MG/L",
                "label": "Federal & Wisconsin MCL, nitrate as N"},
    "arsenic": {"value": 0.010, "units": "MG/L",
                "label": "Federal MCL, arsenic (0.010 mg/L = 10 µg/L, 2001 rule)"},
    "lead": {"value": 15, "units": "UG/L",
             "label": "Federal action level at the 90th percentile of tap samples "
                      "(drops to 10 µg/L under the 2024 LCRI, compliance 2027) "
                      "— not a single-sample standard"},
    "copper": {"value": 1300, "units": "UG/L",
               "label": "Federal action level at the 90th percentile of tap samples "
                        "— not a single-sample standard"},
}

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
    # Non-detects are null by policy. A null ResultAmt with another qualifier
    # (chem data has 'Unexplained' rows) is a value DNR did not record —
    # preserved as null with its qualifier, never coerced.
    if qualifier == "Non-detect" or row["ResultAmt"] is None:
        value = None
    else:
        value = float(row["ResultAmt"])
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


def summarize_chem(rows: list[dict]) -> dict:
    """Per-system chem block: latest and historic max per contaminant key."""
    by_key: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_key[r["key"]].append(r)

    block = {}
    for key in CHEM_KEYS.values():
        krows = sorted(by_key.get(key, []), key=lambda r: r["date"])
        if not krows:
            continue
        last = krows[-1]
        entry = {
            "latest": {
                "value": last["value"], "units": last["units"],
                "date": last["date"], "qualifier": last["qualifier"],
                "sample_source": last["source_code"],
            },
            "n_results": len(krows),
            "n_detections": sum(1 for r in krows if r["value"] is not None),
            "first_sample_date": krows[0]["date"],
        }
        detected = [r for r in krows if r["value"] is not None]
        if detected:
            top = max(detected, key=lambda r: r["value"])
            entry["historic_max"] = {
                "value": top["value"], "units": top["units"], "date": top["date"],
            }
        block[key] = entry
    return block


def summarize_enforcement(actions: list[dict]) -> dict | None:
    if not actions:
        return None
    dates = sorted(a["enforcement_date"][:10] for a in actions if a["enforcement_date"])
    return {
        "total": len(actions),
        "state": sum(1 for a in actions if a["originator_code"] == "S"),
        "federal": sum(1 for a in actions if a["originator_code"] == "F"),
        "first_date": dates[0] if dates else None,
        "latest_date": dates[-1] if dates else None,
    }


def _echo_date(mdy: str | None) -> str | None:
    if not mdy:
        return None
    m, d, y = mdy.split("/")
    return f"{y}-{m}-{d}"


def summarize_echo(row: dict) -> dict:
    """EPA's precomputed compliance view for one system, as ECHO reports it."""
    contams = [
        part.split("=", 1)[1]
        for part in (row["SDWAContaminantsInCurViol"] or "").split("; ")
        if "=" in part
    ]
    return {
        "serious_violator": row["SeriousViolator"] == "Yes",
        "qtrs_with_vio": int(row["QtrsWithVio"] or 0),
        "qtrs_with_snc": int(row["QtrsWithSNC"] or 0),
        "compl_qtrs_history": row["SDWA3yrComplQtrsHistory"] or None,
        "contaminants_in_cur_viol": contams,
        "last_formal_action": _echo_date(row["SDWDateLastFea"]),
        "last_informal_action": _echo_date(row["SDWDateLastIea"]),
        "pb_ale": row["PbAle"],
        "cu_ale": row["CuAle"],
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
    raw_chem = json.loads((RAW / "dws_chem_results.json").read_text())
    raw_advisories = json.loads((RAW / "dnr_fish_advisories.json").read_text())
    raw_echo = json.loads((RAW / "echo_sdwa.json").read_text())
    raw_enforcement = json.loads((RAW / "sdwis_enforcement.json").read_text())
    raw_private_wells = json.loads((RAW / "uwsp_private_wells.json").read_text())
    sdwis_systems = json.loads((RAW / "sdwis_water_systems.json").read_text())
    raw_violations = json.loads((RAW / "sdwis_violations.json").read_text())
    editorial = yaml.safe_load(EDITORIAL_PATH.read_text()) or {}

    results = [parse_result(r) for r in raw_results]

    results_by_pwsid: dict[str, list[dict]] = defaultdict(list)
    for r in results:
        results_by_pwsid[r["pwsid"]].append(r)

    chem_results = [
        parse_result(r) | {"key": CHEM_KEYS[r["ContamCode"]]} for r in raw_chem
    ]
    chem_by_pwsid: dict[str, list[dict]] = defaultdict(list)
    for r in chem_results:
        chem_by_pwsid[r["pwsid"]].append(r)

    violations_by_pwsid: dict[str, list[dict]] = defaultdict(list)
    for v in raw_violations:
        violations_by_pwsid[v["pwsid"]].append(v)

    echo_by_pwsid = {r["PWSId"]: r for r in raw_echo}

    enforcement_by_pwsid: dict[str, list[dict]] = defaultdict(list)
    for a in raw_enforcement:
        enforcement_by_pwsid[a["pwsid"]].append(a)

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
        if pid in chem_by_pwsid:
            record["chem"] = summarize_chem(chem_by_pwsid[pid])
        if pid in echo_by_pwsid:
            record["echo"] = summarize_echo(echo_by_pwsid[pid])
        enf = summarize_enforcement(enforcement_by_pwsid.get(pid, []))
        if enf:
            record["violations"]["enforcement"] = enf
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

    # Fish consumption advisories: dedup geometry rows by ROI_SEQ_NO, keep
    # PFAS-related designations as DNR/DHS recorded them. ROI_START_DATE of
    # epoch 0 is a placeholder, not a real effective date.
    advisories = {}
    for a in raw_advisories:
        if "PFOS" not in (a["ROI_SUBTYPE"] or "") and "PFAS" not in (a["ROI_SUBTYPE"] or ""):
            continue
        advisories[a["ROI_SEQ_NO"]] = {
            "name": a["ROI_SHORT_NAME"],
            "description": a["ROI_DESC"],
            "contaminants": a["ROI_SUBTYPE_DESC"],
            "advice_type": a["ROI_CODE_DESC"],
            "effective": (
                datetime.fromtimestamp(a["ROI_START_DATE"] / 1000, tz=timezone.utc)
                .date().isoformat()
                if a["ROI_START_DATE"] else None
            ),
            "wbic": a["WBIC"],
        }
    advisory_list = sorted(
        advisories.values(), key=lambda a: a["effective"] or "", reverse=True
    )

    chem_orphans = set(chem_by_pwsid) - {s["pwsid"] for s in systems}
    if chem_orphans:
        print(f"note: chem results for {len(chem_orphans)} systems outside the "
              f"inventory (inactive, no PFAS) — not attached")

    # UWSP CWSE private-well aggregates: voluntary homeowner samples since
    # 1985, county-level; context only, no per-well or time-resolved data.
    # Layer schemas differ: nitrate carries EXCEEDENCE (% over 10 mg/L),
    # bacteria carries coliform counts/positivity. The arsenic layer has no
    # exceedance or unit metadata, so it stays in raw only — not displayed.
    private_wells: dict[str, dict] = defaultdict(dict)
    for row in raw_private_wells:
        county = row["Location"].replace(" County", "")
        if row["_parameter"] == "nitrate":
            private_wells[county]["nitrate"] = {
                "samples": row["SAMPLES"],
                "average": round(row["AVERAGE"], 2) if row["AVERAGE"] is not None else None,
                "median": row["MEDIAN"],
                "max": row["MAXIMUM"],
                "exceedance_pct": row["EXCEEDENCE"],
            }
        elif row["_parameter"] == "bacteria":
            private_wells[county]["bacteria"] = {
                "samples": row["BACT_SAMP"],
                "positive_pct": row["POSITIVE"],
            }
    for county, block in private_wells.items():
        if county in county_rollup:
            county_rollup[county]["private_wells"] = block

    summary = {
        "built_at": datetime.now(timezone.utc).isoformat(),
        "thresholds": THRESHOLDS,
        "chem_references": CHEM_REFERENCES,
        "counts": {
            "systems": len(systems),
            "pfas_results": len(results),
            "chem_results": len(chem_results),
            "violations": len(raw_violations),
        },
        "counties": dict(sorted(county_rollup.items())),
        "fish_advisories": advisory_list,
        "data_notes": {
            "dws": "DNR DWS portal data, current as of ~10 p.m. the prior day.",
            "sdwis": "EPA SDWIS federal data refreshes quarterly; violations can lag DNR records.",
            "non_detects": "Non-detect results carry value null; qualifier and LOD are preserved.",
        },
    }

    PROCESSED.mkdir(parents=True, exist_ok=True)
    (PROCESSED / "pfas_results.json").write_text(json.dumps(results))
    (PROCESSED / "chem_results.json").write_text(json.dumps(chem_results))
    (PROCESSED / "systems.json").write_text(json.dumps(systems, indent=1))
    (PROCESSED / "summary.json").write_text(json.dumps(summary, indent=1))
    print(f"systems: {len(systems)} | pfas results: {len(results)} | "
          f"chem results: {len(chem_results)} | violations: {len(raw_violations)}")
    for county, c in sorted(county_rollup.items()):
        print(f"  {county:10} systems:{c['systems']:4}  sampled:{c['sampled_for_pfas']:4}  "
              f"detections:{c['with_pfas_detections']:4}  unresolved viol:{c['with_unresolved_violations']:3}")


if __name__ == "__main__":
    main()
