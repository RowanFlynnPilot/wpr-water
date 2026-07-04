# STATUS — wpr-water

Living session snapshot. Update at the end of every working session.

## Current state (2026-07-04, second session)

Build-side pipeline: **complete and green**. First full data pull committed.

- 9,996 PFAS results (34 analytes, 6 counties, 2019→present)
- 730 active systems, 2,390 violations
- All three scrapers verified against live endpoints; transform verified
  end-to-end on real data

Frontend (`web/`): **complete and deployed**. Live at
https://rowanflynnpilot.github.io/wpr-water/ with all four views, verified
against real data (Wausau reference system end-to-end):

1. System search / card — search 730 systems by name/city; card shows key
   analytes with honest qualifiers (`<LOD`, trace), combined PFOA+PFOS vs
   both standards, violations summary with quarterly-lag caveat.
2. Trend chart — PFOA/PFOS per entry point, non-detects as open markers on
   the zero line, 4.0 federal line drawn, 70 state line off-scale note;
   Hazard Index mini-chart labeled "proposed for rescission". Wausau
   centerpiece renders 12.0 (Jul 2023) → 6.5 (May 2026).
3. County board — six county rollups; 130 systems with unresolved
   violations ranked by unresolved health-based.
4. Remediation tracker — five municipal cards; narratives **gated on
   `verified_by`** (all null → "pending newsroom verification" placeholder).

Stack: React/Vite, no chart library (hand-rolled SVG), self-hosted
fontsource fonts, ~68 KB gzipped JS. Canonical system key is the EPA
`pwsid` (622 of 730 systems are SDWIS-only with no DNR id). Combined
PFOA+PFOS renders `<LOD` when both are non-detects (transform emits 0).

Deploy: GitHub Pages switched from legacy branch deploy to **Actions
workflow** (`.github/workflows/pages.yml`) — builds `web/`, publishes
dist at the site root with `data/processed/` alongside, so data URLs are
unchanged. Triggers: push to master, manual dispatch, and Sundays 8am UTC
(one hour after the data cron — needed because the cron's GITHUB_TOKEN
push cannot trigger other workflows). First deploy run green; site, all
three data URLs, and JS bundle verified 200 on 2026-07-04.

Local dev: `npm run dev` in `web/` (or the `web-dev` entry in
`.claude/launch.json`); a Vite middleware serves `../data/processed/`
at the production path, so there is exactly one fetch path.

## Locked decisions

- DNR DWS `api/contamresults` is the sole PFAS source. The ArcGIS EM PFAS
  layer was evaluated and rejected (classification strings, PLSS centroids —
  not raw values). Do not add it back as a fallback.
- EPA SDWIS (Envirofacts) is the sole violations source, with the quarterly
  lag disclosed in the UI.
- Join key: `EPA PWSID = "WI" + DNR_PwsId[:7]` (8th DNR digit is a check
  digit). Verified against 4 known systems.
- "Unresolved" violation = no `rtc_date`. Derived from evidence, not the
  letter codes (R/I always have rtc_date, O/K never do).
- Non-detects are `null`, never 0. Qualifiers preserved through to the UI.
- Editorial policy in CLAUDE.md is binding — reference lines, not verdicts.
- Weekly Sunday 7am UTC cron, matching wpr-trails.

## Next phase: launch polish

- Shereen sign-off on the five `editorial.yaml` narratives (tracker cards
  flip from placeholder to narrative automatically once `verified_by` set
  and the pipeline re-runs).
- WordPress iframe embed on the companion story page.
- Optional: screenshot/social card for the July 7 hearing coverage.

## Blockers / needs-human

- `editorial.yaml`: all five municipal narratives are `verified_by: null`.
  Shereen sign-off required before the remediation tracker view displays them.
- Confirm one manual `workflow_dispatch` run is green before trusting the
  Sunday cron.
- News peg: EPA hearing July 7, comment period closes July 20, 2026.

## Session log

- **2026-07-04 (later)** — Frontend build and deploy (Claude Code). Four
  views built and verified on real data; Pages switched to Actions deploy;
  first deploy green; live site verified. Data contract discovery: 622/730
  systems are SDWIS-only (no DNR id) → EPA `pwsid` is the canonical key.
- **2026-07-04** — Source validation and full pipeline build (claude.ai).
  Discovered DWS JSON API, established join key, fixed compliance-status
  misread (letter codes → rtc_date test), first 6-county pull committed.
