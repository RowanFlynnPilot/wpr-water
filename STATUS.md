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

## Data sources: all six verified candidates INGESTED (2026-07-04)

All six "ingest" recommendations from the source scout are now live in the
pipeline (scrapers + transform + UI): DWS chem results (nitrate/arsenic/
lead/copper), DNR PFOS fish advisories, ECHO serious-violator rollups,
SDWIS enforcement actions, UWSP private-well county aggregates, and BRRTS
open cleanup activities. Endpoint details live in the scraper docstrings
and CLAUDE.md.

Still skipped (with reasons):
- **Lead service line inventories** — submitted to DNR Oct 2024 but not
  published programmatically; needs a records request or PSC annual
  reports (newsroom action, not scraper). Re-check after LCRI milestones.
- **UCMR5** — redundant; DNR DWS already carries all PFAS samples for our
  systems, fresher and with lower detection limits.
- **Envirofacts LCR_SAMPLE (lead 90th percentiles)** — stale in SDWIS Fed
  (Wausau ends Oct 2020); revisit only as historical context.

## Blockers / needs-human

- UWSP CWSE private-well data is displayed with attribution + disclaimer;
  confirm reuse terms with the Center before launch (no license stated on
  the service).

- `editorial.yaml`: all five municipal narratives are `verified_by: null`.
  Shereen sign-off required before the remediation tracker view displays them.
- Confirm one manual `workflow_dispatch` run is green before trusting the
  Sunday cron.
- News peg: EPA hearing July 7, comment period closes July 20, 2026.

## Session log

- **2026-07-15** — Pipeline rescue + engagement features (Claude Code).
  Found both Sunday crons dead (DNR portal unreachable from Actions at
  2-3am Central — maintenance window); moved refresh to Sun 15:00 UTC,
  added DWS connection retries and issue-on-failure alerting; manual run
  green, fresh data (built 2026-07-16 UTC) deployed. New features:
  date-gated public-comment banner (through Jul 20), masthead "data as
  of" freshness line, nitrate trend toggle on the trend view (Whiting
  Waterworks: 18.97 mg/L peak vs 10 MCL, 59 samples), ECHO 13-quarter
  compliance strip on system cards (Deer Trail: 7 SNC + 6 violation
  quarters). All verified in browser.

- **2026-07-04 (sixth pass)** — Post-ingest refinement review (Claude
  Code). County board capped to top 25 with show-all toggle (page height
  23.8k px → 6.8k px); ECHO all-caps rule names calm-cased in prose;
  mobile swipe hints on private-wells + advisories tables; zero-signal
  ECHO blocks dropped from systems.json (730 → 539); footer attribution
  for ECHO / UWSP CWSE / BRRTS. All views re-verified desktop + 375px.

- **2026-07-04 (fifth pass)** — Six new data sources ingested end-to-end
  (Claude Code): DWS chem results (9,839 rows; chem block on 588 systems,
  card panel with MCL/action-level references), PFOS fish advisories (5 on
  the Wisconsin River corridor; county board table), ECHO rollups (1,886
  systems; Deer Trail Village = the area's one EPA serious violator, 7
  qtrs SNC; card chip + board flag), SDWIS enforcement (4,341 actions;
  card enforcement line), UWSP private-well aggregates (county board panel
  — Portage 23.1% nitrate exceedance across 19,309 samples), BRRTS open
  cleanup counts by city (Wausau 19, incl. Wauleco open since 1984; card
  context panel). Weekly cron runs all nine scrapers. Each phase verified
  in the browser before commit.

- **2026-07-04 (fourth pass)** — New data points + River Street-inspired
  additions (Claude Code). Transform now emits per-system violation detail
  (12 most recent, rule/contaminant codes, rtc status), oldest-unresolved
  dates, county population coverage (population_served /
  population_pfas_sampled), and non-key-analyte detections; counts
  verified unchanged (730/9,996/2,390). Frontend: violation history table
  with federal rule names, "open since" on card + county board, "people
  covered by a test" % on county cards (Marathon: 92%), "also detected"
  analyte line, PWSID search, private-well callout, data download links,
  og/social meta tags. Styled chart tooltip + chart formatting rework.

- **2026-07-04 (third pass)** — Brand alignment + tidy (Claude Code).
  Restyled to match wausaupilotandreview.com (Newspack "Joseph"): Oswald
  headings, Merriweather body, black/white newsprint, typewriter badge +
  wordmark in the masthead, site red for reference lines. Tidy pass:
  accurate entry-point legend, qualifier labels in sample table,
  aria-current tabs, focus styles, mobile chart scroll, DNR/WI title-case
  fixes. All four views re-verified; mobile has no page-level overflow.

- **2026-07-04 (later)** — Frontend build and deploy (Claude Code). Four
  views built and verified on real data; Pages switched to Actions deploy;
  first deploy green; live site verified. Data contract discovery: 622/730
  systems are SDWIS-only (no DNR id) → EPA `pwsid` is the canonical key.
- **2026-07-04** — Source validation and full pipeline build (claude.ai).
  Discovered DWS JSON API, established join key, fixed compliance-status
  misread (letter codes → rtc_date test), first 6-county pull committed.
