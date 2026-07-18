import { useEffect, useMemo, useState } from 'react'
import { loadChemResults, loadPfasResults } from '../api.js'
import TrendChart from './TrendChart.jsx'
import { fmtDate, fmtMonthYear, titleCase } from '../format.js'

const HI_ANALYTE = 'EPA PFAS HAZARD INDEX'
const DEFAULT_ID = 'WI7370102' // Wausau Waterworks — launch centerpiece

const QUALIFIER_LABELS = {
  'No problem': 'detected',
  'Non-detect': 'non-detect',
  'Between LOD and LOQ': 'trace (between LOD and LOQ)',
}

function SystemSelect({ systems, current, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const sampled = useMemo(() => systems.filter((s) => s.pfas.sampled || s.chem), [systems])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = q.length < 1
      ? sampled
      : sampled.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.city_served && s.city_served.toLowerCase().includes(q))
        )
    return pool.slice(0, 40)
  }, [sampled, query])

  return (
    <div className="sys-select">
      <input
        className="search-input"
        type="search"
        placeholder={current ? `${titleCase(current.name)} — type to change system…` : 'Choose a system…'}
        value={query}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        aria-label="Choose a water system"
      />
      {open && (
        <div className="dropdown">
          {matches.map((s) => (
            <button
              key={s.pwsid}
              onMouseDown={() => {
                onSelect(s.pwsid)
                setQuery('')
                setOpen(false)
              }}
            >
              {titleCase(s.name)}{' '}
              <span className="result-meta">
                · {s.county} Co.
                {s.pfas.sampled ? ` · ${s.pfas.n_results} PFAS results` : ' · no PFAS tests'}
              </span>
            </button>
          ))}
          {matches.length === 0 && <button disabled>No sampled systems match.</button>}
        </div>
      )}
    </div>
  )
}

export default function TrendView({ systems, summary, systemId, onSelect }) {
  const [group, setGroup] = useState('pfas') // 'pfas' | 'nitrate'
  const [pfasResults, setPfasResults] = useState(null)
  const [chemResults, setChemResults] = useState(null)
  const [error, setError] = useState(null)

  const effectiveId = useMemo(() => {
    const sel = systems.find((s) => s.pwsid === systemId)
    if (sel && (sel.pfas.sampled || sel.chem)) return systemId
    return DEFAULT_ID
  }, [systems, systemId])

  const system = systems.find((s) => s.pwsid === effectiveId)
  const chartCaption = system
    ? `${titleCase(system.name)} · WI DNR data · Wausau Pilot & Review`
    : undefined

  useEffect(() => {
    loadPfasResults().then(setPfasResults).catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    if (group === 'nitrate' && !chemResults) {
      loadChemResults().then(setChemResults).catch((e) => setError(e.message))
    }
  }, [group, chemResults])

  const { mainPoints, hiPoints } = useMemo(() => {
    if (group === 'nitrate') {
      if (!chemResults) return { mainPoints: [], hiPoints: [] }
      return {
        mainPoints: chemResults
          .filter((r) => r.pwsid === effectiveId && r.key === 'nitrate')
          .map((r) => ({ ...r, analyte: 'nitrate' })),
        hiPoints: [],
      }
    }
    if (!pfasResults) return { mainPoints: [], hiPoints: [] }
    const mine = pfasResults.filter((r) => r.pwsid === effectiveId)
    return {
      mainPoints: mine.filter((r) => r.analyte === 'PFOA' || r.analyte === 'PFOS'),
      hiPoints: mine.filter((r) => r.analyte === HI_ANALYTE),
    }
  }, [group, pfasResults, chemResults, effectiveId])

  const loading = group === 'nitrate' ? !chemResults : !pfasResults
  const t = summary.thresholds
  const nitrateRef = summary.chem_references?.nitrate
  const nitrate = system?.chem?.nitrate

  // Lead the summary with whichever of PFOA/PFOS actually peaked —
  // Weston is a PFOS story, Wausau a PFOA one.
  const hm = system?.pfas?.historic_max || {}
  const leadAnalyte = (hm.PFOS?.value ?? -1) > (hm.PFOA?.value ?? -1) ? 'PFOS' : 'PFOA'
  const leadMax = hm[leadAnalyte]
  const leadLatest = system?.pfas?.latest?.[leadAnalyte]

  return (
    <div className="panel">
      <h2>{group === 'pfas' ? 'PFOA & PFOS over time' : 'Nitrate over time'}</h2>
      <p className="subhead">
        Every DNR-recorded sample for the selected system, by entry point to the distribution
        system. Reference lines are regulatory context, not compliance determinations.
      </p>

      <SystemSelect systems={systems} current={system} onSelect={onSelect} />

      <div className="tabs" role="group" aria-label="Contaminant group">
        <button className={group === 'pfas' ? 'active' : ''} onClick={() => setGroup('pfas')}>
          PFOA &amp; PFOS
        </button>
        <button className={group === 'nitrate' ? 'active' : ''} onClick={() => setGroup('nitrate')}>
          Nitrate
        </button>
      </div>

      {error && <div className="error">Could not load sample data: {error}</div>}
      {!error && loading && <div className="loading">Loading sample results…</div>}

      {!loading && system && group === 'pfas' && mainPoints.length > 0 && (
        <>
          {leadMax?.value != null && leadLatest && (
            <p className="subhead">
              <strong>{titleCase(system.name)}</strong>: {leadAnalyte} peaked at{' '}
              <span className="mono">{leadMax.value} ng/L</span> ({fmtMonthYear(leadMax.date)});
              the latest {leadAnalyte} sample is{' '}
              <span className="mono">
                {leadLatest.value != null ? `${leadLatest.value} ng/L` : '<LOD'}
              </span>{' '}
              ({fmtMonthYear(leadLatest.date)}).
            </p>
          )}
          <TrendChart
            points={mainPoints}
            series={[
              { analyte: 'PFOA', label: 'PFOA', color: '#3a867c' },
              { analyte: 'PFOS', label: 'PFOS', color: '#313131' },
            ]}
            caption={chartCaption}
            refLines={[
              {
                value: t.federal_mcl_pfoa.value,
                label: `Federal MCL ${t.federal_mcl_pfoa.value.toFixed(1)} ng/L (PFOA and PFOS, each)`,
              },
              {
                value: t.wi_combined_pfoa_pfos.value,
                label: `Wisconsin standard ${t.wi_combined_pfoa_pfos.value} ng/L (PFOA+PFOS combined)`,
              },
            ]}
          />
          <p className="note">
            Federal MCLs of 4.0 ng/L each for PFOA and PFOS took effect with the April 2024 rule;
            the compliance deadline is 2029, with an extension to 2031 proposed in May 2026. The
            Wisconsin standard of 70 ng/L applies to PFOA and PFOS combined (NR 809, Aug 2022).
          </p>

          {hiPoints.length > 0 && (
            <>
              <h3 style={{ marginTop: 22 }}>EPA PFAS Hazard Index</h3>
              <p className="subhead">
                A combined index for PFHxS, PFNA, HFPO-DA (GenX) and PFBS, computed by DNR. The
                federal Hazard Index MCL of 1.0 was{' '}
                <strong>proposed for rescission on May 18, 2026</strong>.
              </p>
              <TrendChart
                points={hiPoints}
                series={[{ analyte: HI_ANALYTE, label: 'Hazard Index', color: '#607d8b' }]}
                caption={chartCaption}
                refLines={[
                  { value: t.federal_hazard_index.value, label: 'Hazard Index MCL 1.0 (proposed for rescission, May 2026)' },
                ]}
                unit="index"
              />
            </>
          )}
        </>
      )}

      {!loading && system && group === 'nitrate' && mainPoints.length > 0 && (
        <>
          {nitrate?.historic_max && (
            <p className="subhead">
              <strong>{titleCase(system.name)}</strong>: highest nitrate since 2020 was{' '}
              <span className="mono">{nitrate.historic_max.value} mg/L</span> (
              {fmtMonthYear(nitrate.historic_max.date)}); the latest sample is{' '}
              <span className="mono">
                {nitrate.latest.value != null ? `${nitrate.latest.value} mg/L` : '<LOD'}
              </span>{' '}
              ({fmtMonthYear(nitrate.latest.date)}).
            </p>
          )}
          <TrendChart
            points={mainPoints}
            series={[{ analyte: 'nitrate', label: 'Nitrate (as N)', color: '#3a867c' }]}
            caption={chartCaption}
            refLines={
              nitrateRef
                ? [{ value: nitrateRef.value, label: `Federal & Wisconsin MCL ${nitrateRef.value} mg/L` }]
                : []
            }
            unit="mg/L"
          />
          <p className="note">
            Nitrate above 10 mg/L is a health standard aimed chiefly at infants. Compliance is
            determined by DNR/EPA, not by any single sample shown here. Chart covers samples
            since 2020.
          </p>
        </>
      )}

      {!loading && system && mainPoints.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary>
            All {group === 'pfas' ? 'PFOA / PFOS' : 'nitrate'} samples for this system
          </summary>
          <p className="scroll-hint" aria-hidden="true">
            swipe sideways to see the full table →
          </p>
          <div className="table-scroll">
            <table className="board" style={{ marginTop: 10 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Analyte</th>
                  <th className="num">Result</th>
                  <th>Qualifier</th>
                  <th className="num">Entry point</th>
                  <th>Sample type</th>
                </tr>
              </thead>
              <tbody>
                {[...mainPoints]
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((r) => (
                    <tr key={r.seq_no}>
                      <td>{fmtDate(r.date)}</td>
                      <td>{group === 'nitrate' ? 'Nitrate (as N)' : r.analyte}</td>
                      <td className="num mono">
                        {r.value == null ? (r.lod ? `<LOD (${r.lod})` : '—') : `${r.value}`}
                      </td>
                      <td>{QUALIFIER_LABELS[r.qualifier] || r.qualifier}</td>
                      <td className="num mono">{r.source_id ?? '—'}</td>
                      <td>{r.sample_type}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {!loading && system && mainPoints.length === 0 && (
        <p className="subhead">
          No {group === 'pfas' ? 'PFOA/PFOS' : 'nitrate'} sample records for this system
          {group === 'nitrate' ? ' since 2020' : ''}.
        </p>
      )}
    </div>
  )
}
