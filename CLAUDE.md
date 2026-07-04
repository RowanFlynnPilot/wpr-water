# wpr-water — "What's in the Water?"

PFAS and drinking water compliance tracker for Wausau Pilot & Review.
Covers every public water system in the 6-county coverage area: Marathon,
Lincoln, Langlade, Taylor, Shawano, Portage.

Two jobs in one widget:
1. **PFAS tracker** — raw sample results (ng/L) for all 34 analytes, per
   system, per entry point, charted against labeled regulatory reference
   lines. Tracks remediation progress in Wausau, Weston, Rib Mountain,
   Rothschild, Mosinee.
2. **Compliance board** — SDWA violations across all contaminant types,
   surfacing small systems with unresolved health-based violations that
   never make the news.

## Architecture

Standard WPR pattern: Python scrapers → GitHub Actions cron → static JSON →
React/Vite → GitHub Pages → WordPress iframe embed.

```
scrapers/    Network-bound pulls; one source per file
transforms/  Pure transforms on local data; build the widget contract
data/raw/    Raw scraper output (committed for reproducibility)
data/processed/  Widget-facing JSON (served via GitHub Pages)
data/editorial.yaml  Newsroom-owned per-system narratives (DNR PWS ID keyed)
web/         React/Vite frontend (built by Claude Code — see spec below)
```

Weekly cron (Sunday 7am UTC — sampling is quarterly, weekly is generous):
```
python -m scrapers.dws_pfas_results
python -m scrapers.sdwis_water_systems
python -m scrapers.sdwis_violations
python -m transforms.build_water
```

## Data sources (all verified working 2026-07-04)

| Source | What | Freshness | Access |
|---|---|---|---|
| DNR DWS portal API | Raw PFAS sample results, all analytes, ng/L | Nightly | POST, no auth |
| EPA SDWIS (Envirofacts) | System inventory + violations/enforcement | Quarterly | GET JSON |

### DNR DWS portal — the workhorse

`POST https://apps.dnr.wi.gov/dwsportalpub/api/contamresults`

This is the JSON API behind the portal's Contaminants search (DataTables
server-side). Requires the full DataTables param envelope (`draw`,
`columns[i][...]`, `order`, `start`, `length`) plus the search model —
see `scrapers/dws_pfas_results.py` for the exact verified shape.
`length=-1` returns all rows. The server returns the **complete row model**
regardless of requested columns: value, units, LOD, LOQ, qualifier, sample
type, entry point (`EpaSourceId`), method, lab, and a stable
`SampleResultSeqNo` for dedup.

County codes (portal's own): Langlade 34, Lincoln 35, Marathon 37,
Portage 50, Shawano 59, Taylor 61.
PFAS analyte codes: full 34-code panel in the scraper, including
PFOA `2806`, PFOS `2805`, HFPO-DA/GenX `2816`, and DNR's computed
PFAS Hazard Index `X157`.

Do NOT use the DNR ArcGIS "EM PFAS - Municipal System PFAS Sampling" layer
for values — it is generalized to classification strings and PLSS centroids.
The DWS API is the raw source. One correct path.

### EPA SDWIS via Envirofacts

Join queries, one call per county:
```
https://data.epa.gov/efservice/GEOGRAPHIC_AREA/COUNTY_SERVED/=/{County}/STATE_SERVED/=/WI/WATER_SYSTEM/JSON
https://data.epa.gov/efservice/GEOGRAPHIC_AREA/COUNTY_SERVED/=/{County}/STATE_SERVED/=/WI/VIOLATION/JSON
```
Federal SDWIS refreshes quarterly from state submissions — violations can
lag DNR's records by up to a quarter. The UI must say so.

### Join key

`EPA PWSID = "WI" + DNR_PwsId[:7]` — the DNR 8th digit is a check digit.
Verified against Wausau (73701023→WI7370102), Antigo, Merrill, Weston.

### Known municipal DNR PWS IDs

| System | DNR ID |
|---|---|
| Wausau Waterworks | 73701023 |
| Weston Municipal Utilities | 73701639 |
| Rib Mountain Water Utility | 73706600 |
| Rothschild Waterworks | 73701617 |
| Mosinee Waterworks | 73701595 |
| Merrill Waterworks | 73501230 |
| Schofield Waterworks | 73701628 |
| Antigo Waterworks | 73400866 |

## Editorial policy (binding — mirrors the RETR scraper pattern)

1. **We report regulators' records; we do not adjudicate.** The tool shows
   DNR-recorded results and EPA-recorded violations. It never computes its
   own violation determinations — MCL compliance is a running-annual-average
   calculation that belongs to DNR/EPA.
2. **Non-detects are null, never 0.** Qualifier and LOD are preserved.
   Results "Between LOD and LOQ" are labeled trace/estimated in the UI.
3. **Thresholds are labeled reference lines, not verdicts:**
   - WI enforceable standard: 70 ng/L PFOA+PFOS combined (NR 809, Aug 2022)
   - Federal MCLs: 4.0 ng/L each PFOA and PFOS (Apr 2024 rule; in force,
     compliance deadline 2029, proposed extension to 2031 — proposed rule
     May 18, 2026, comments close July 20, 2026)
   - Federal MCLs for PFHxS/PFNA/HFPO-DA and the Hazard Index: **proposed
     for rescission May 18, 2026** — must be labeled as such wherever shown
4. **"Unresolved" violation = no return-to-compliance (rtc) date** in SDWIS.
   Verified 2026-07-04: status codes R/I always carry rtc_date, O/K never do.
5. **Data lag disclosure**: violations panel carries the quarterly-refresh
   caveat; PFAS panel notes nightly DNR refresh.
6. Every `editorial.yaml` entry requires newsroom verification
   (`verified_by`) before display.

## Processed data contract

`systems.json` — one record per active system (or any system with PFAS
results): identity (both IDs, name, county, type, population,
city_served, source), `pfas` block (sampled flag, first/latest sample dates,
latest + historic max per key analyte with qualifiers,
latest_combined_pfoa_pfos), `violations` block (total, health_based,
unresolved, unresolved_health_based, since_2020, latest_date, categories),
optional `editorial` block.

`pfas_results.json` — slim per-sample records for trend charts (analyte,
value|null, units, qualifier, lod, loq, date, sample_type, source_id).

`summary.json` — built_at, thresholds (values + display labels), counts,
county rollups, data_notes.

## Frontend spec (Claude Code handoff)

React/Vite in `web/`, deployed to GitHub Pages, embedded via WordPress
iframe. Matches the wausaupilotandreview.com brand (Newspack "Joseph"
theme): Oswald headings, Merriweather body, JetBrains Mono for data
values; black/white newsprint palette with the typewriter-badge teal
`#3A867C` as accent and site red `#cf2e2e` for warnings/reference lines.
Typewriter badge + wordmark bundled in `web/src/assets/`.

Views:
1. **"What's in my water?"** — system search (name/city), system card with
   latest key-analyte values, qualifiers rendered honestly (`<LOD`,
   `trace`), combined PFOA+PFOS vs both standards, violations summary,
   editorial narrative when present.
2. **Trend chart** — per system, PFOA/PFOS (and HI) over time with the
   4 ng/L and 70 ng/L reference lines labeled per editorial policy.
   Wausau's chart is the launch centerpiece: historic max PFOA 12.0 (Jul
   2023) → 6.5 (May 2026) shows treatment working against the federal line.
3. **County board** — rollups per county; systems ranked by unresolved
   health-based violations; sampled-vs-never-sampled split.
4. **Remediation tracker** — editorial cards for the municipal systems
   (Wausau, Weston, Rib Mountain, Rothschild, Mosinee).

## Launch context

EPA public hearing on both proposed PFAS rules: **July 7, 2026**. Written
comments close **July 20, 2026**. WPR's May 19, 2026 story on the $15M
federal announcement is the editorial companion piece.

## Engineering rules

One correct path, no fallbacks. Fail fast and loud. Surgical
single-responsibility changes. No overengineering. Fix root causes, not
symptoms. Windows/PowerShell 5.1 locally (semicolons, not `&&`);
Python 3.14; GitHub account `RowanFlynnPilot`.
