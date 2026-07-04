import { useEffect, useMemo, useState } from 'react'
import { loadPfasResults } from '../api.js'
import TrendChart from './TrendChart.jsx'
import { fmtDate, fmtMonthYear, titleCase } from '../format.js'

const HI_ANALYTE = 'EPA PFAS HAZARD INDEX'
const DEFAULT_ID = 'WI7370102' // Wausau Waterworks — launch centerpiece

function SystemSelect({ systems, current, onSelect }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const sampled = useMemo(() => systems.filter((s) => s.pfas.sampled), [systems])
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
                · {s.county} Co. · {s.pfas.n_results} results
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
  const [allResults, setAllResults] = useState(null)
  const [error, setError] = useState(null)

  const effectiveId = useMemo(() => {
    const sel = systems.find((s) => s.pwsid === systemId)
    if (sel && sel.pfas.sampled) return systemId
    return DEFAULT_ID
  }, [systems, systemId])

  const system = systems.find((s) => s.pwsid === effectiveId)

  useEffect(() => {
    loadPfasResults().then(setAllResults).catch((e) => setError(e.message))
  }, [])

  const { mainPoints, hiPoints } = useMemo(() => {
    if (!allResults) return { mainPoints: [], hiPoints: [] }
    const mine = allResults.filter((r) => r.pwsid === effectiveId)
    return {
      mainPoints: mine.filter((r) => r.analyte === 'PFOA' || r.analyte === 'PFOS'),
      hiPoints: mine.filter((r) => r.analyte === HI_ANALYTE),
    }
  }, [allResults, effectiveId])

  const t = summary.thresholds
  const maxPfoa = system?.pfas?.historic_max?.PFOA
  const latestPfoa = system?.pfas?.latest?.PFOA

  return (
    <div className="panel">
      <h2>PFOA &amp; PFOS over time</h2>
      <p className="subhead">
        Every DNR-recorded sample for the selected system, by entry point to the distribution
        system. Reference lines are regulatory context, not compliance determinations.
      </p>

      <SystemSelect systems={systems} current={system} onSelect={onSelect} />

      {error && <div className="error">Could not load sample data: {error}</div>}
      {!error && !allResults && <div className="loading">Loading sample results…</div>}

      {allResults && system && mainPoints.length > 0 && (
        <>
          {maxPfoa?.value != null && latestPfoa && (
            <p className="subhead">
              <strong>{titleCase(system.name)}</strong>: PFOA peaked at{' '}
              <span className="mono">{maxPfoa.value} ng/L</span> ({fmtMonthYear(maxPfoa.date)});
              the latest sample is{' '}
              <span className="mono">
                {latestPfoa.value != null ? `${latestPfoa.value} ng/L` : '<LOD'}
              </span>{' '}
              ({fmtMonthYear(latestPfoa.date)}).
            </p>
          )}
          <TrendChart
            points={mainPoints}
            series={[
              { analyte: 'PFOA', label: 'PFOA', color: '#3a867c' },
              { analyte: 'PFOS', label: 'PFOS', color: '#c26a4a' },
            ]}
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
                series={[{ analyte: HI_ANALYTE, label: 'Hazard Index', color: '#b98a2e' }]}
                refLines={[
                  { value: t.federal_hazard_index.value, label: 'Hazard Index MCL 1.0 (proposed for rescission, May 2026)' },
                ]}
                unit="index"
              />
            </>
          )}

          <details style={{ marginTop: 16 }}>
            <summary>All PFOA / PFOS samples for this system</summary>
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
                        <td>{r.analyte}</td>
                        <td className="num mono">{r.value == null ? `<LOD (${r.lod})` : `${r.value}`}</td>
                        <td>{r.qualifier === 'No problem' ? 'detected' : r.qualifier.toLowerCase()}</td>
                        <td className="num mono">{r.source_id}</td>
                        <td>{r.sample_type}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      {allResults && system && mainPoints.length === 0 && (
        <p className="subhead">No PFOA/PFOS sample records for this system.</p>
      )}
    </div>
  )
}
