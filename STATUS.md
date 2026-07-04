# STATUS — wpr-water

Living session snapshot. Update at the end of every working session.

## Current state (2026-07-04)

Build-side pipeline: **complete and green**. First full data pull committed.

- 9,996 PFAS results (34 analytes, 6 counties, 2019→present)
- 730 active systems, 2,390 violations
- All three scrapers verified against live endpoints; transform verified
  end-to-end on real data

Frontend (`web/`): **not started**. That is the next phase.

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

## Next phase: frontend (Claude Code)

Scaffold `web/` React/Vite per the CLAUDE.md frontend spec. Four views:
system search/card, trend chart, county board, remediation tracker.
WPR design system: teal #3A867C, cream #f6f2e9, Fraunces / Public Sans /
JetBrains Mono.

Data URLs once Pages is enabled (main branch, root):
`https://rowanflynnpilot.github.io/wpr-water/data/processed/summary.json`
(+ systems.json, pfas_results.json)

During local dev, fetch from relative `../data/processed/` or run against
the Pages URL — pick one, not both.

Launch centerpiece: Wausau Waterworks trend chart — PFOA historic max
12.0 ng/L (2023-07-18) → 6.5 (2026-05-12) against the 4.0 federal line
and 70 combined state line.

## Blockers / needs-human

- `editorial.yaml`: all five municipal narratives are `verified_by: null`.
  Shereen sign-off required before the remediation tracker view displays them.
- Confirm one manual `workflow_dispatch` run is green before trusting the
  Sunday cron.
- News peg: EPA hearing July 7, comment period closes July 20, 2026.

## Session log

- **2026-07-04** — Source validation and full pipeline build (claude.ai).
  Discovered DWS JSON API, established join key, fixed compliance-status
  misread (letter codes → rtc_date test), first 6-county pull committed.
