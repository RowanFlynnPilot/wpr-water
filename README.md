# wpr-water

"What's in the Water?" — PFAS and drinking water compliance tracker for
Wausau Pilot & Review, covering all public water systems in Marathon,
Lincoln, Langlade, Taylor, Shawano and Portage counties.

- Raw PFAS sample results (34 analytes, ng/L) from the Wisconsin DNR
  Drinking Water System portal API, refreshed weekly
- SDWA violations and system inventory from EPA SDWIS (Envirofacts)
- Newsroom-curated remediation narratives in `data/editorial.yaml`

See `CLAUDE.md` for architecture, verified data source details, the
binding editorial policy, and the frontend spec.

## Pipeline

```
python -m scrapers.dws_pfas_results
python -m scrapers.sdwis_water_systems
python -m scrapers.sdwis_violations
python -m transforms.build_water
```

Outputs land in `data/processed/` and are served via GitHub Pages.
