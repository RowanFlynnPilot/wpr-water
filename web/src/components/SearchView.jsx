import { useMemo, useState } from 'react'
import SystemCard from './SystemCard.jsx'
import { titleCase } from '../format.js'

const QUICK_IDS = [
  'WI7370102', // Wausau
  'WI7370163', // Weston
  'WI7370660', // Rib Mountain
  'WI7370161', // Rothschild
  'WI7370159', // Mosinee
  'WI7350123', // Merrill
  'WI7370162', // Schofield
  'WI7340086', // Antigo
]

export default function SearchView({ systems, summary, systemId, onSelect, onShowTrend }) {
  const [query, setQuery] = useState('')

  const selected = useMemo(
    () => (systemId ? systems.find((s) => s.pwsid === systemId) || null : null),
    [systems, systemId]
  )

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return systems
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.city_served && s.city_served.toLowerCase().includes(q))
      )
      .slice(0, 30)
  }, [systems, query])

  const quick = useMemo(
    () => QUICK_IDS.map((id) => systems.find((s) => s.pwsid === id)).filter(Boolean),
    [systems]
  )

  return (
    <div>
      <div className="panel">
        <h2>What&rsquo;s in my water?</h2>
        <p className="subhead">
          Search {summary.counts.systems.toLocaleString()} public water systems by system name or
          the city it serves. Private wells are not in this database.
        </p>
        <input
          className="search-input"
          type="search"
          placeholder="Search by system or city — e.g. “Wausau”, “Merrill”, “mobile home”…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search water systems"
        />
        {query.trim().length >= 2 && (
          <ul className="result-list">
            {matches.map((s) => (
              <li key={s.pwsid}>
                <button
                  onClick={() => {
                    onSelect(s.pwsid)
                    setQuery('')
                  }}
                >
                  <span className="result-name">{titleCase(s.name)}</span>
                  <span className="result-meta">
                    {s.county} Co.
                    {s.pfas.sampled ? ' · PFAS sampled' : ''}
                    {s.violations.unresolved_health_based > 0
                      ? ` · ${s.violations.unresolved_health_based} unresolved health-based`
                      : ''}
                  </span>
                </button>
              </li>
            ))}
            {matches.length === 0 && (
              <li>
                <p className="subhead" style={{ marginTop: 10 }}>
                  No systems match “{query}”.
                </p>
              </li>
            )}
          </ul>
        )}
        {!selected && (
          <div className="quick-links">
            {quick.map((s) => (
              <button key={s.pwsid} onClick={() => onSelect(s.pwsid)}>
                {titleCase(s.name).replace(/ Waterworks| Municipal Utilities| Water Utility/, '')}
              </button>
            ))}
          </div>
        )}
        <p className="note">
          <strong>On a private well?</strong> Your water is not in this database — or any
          regulator&rsquo;s. Private wells are only tested when the owner orders a test. The{' '}
          <a href="https://dnr.wisconsin.gov/topic/Wells" target="_blank" rel="noreferrer">
            DNR&rsquo;s private well pages
          </a>{' '}
          explain how and what to test for, the{' '}
          <a href="https://www.slh.wisc.edu/environmental/water/" target="_blank" rel="noreferrer">
            Wisconsin State Laboratory of Hygiene
          </a>{' '}
          runs homeowner water tests, and the{' '}
          <a href="https://dnr.wisconsin.gov/topic/PFAS" target="_blank" rel="noreferrer">
            DNR&rsquo;s PFAS pages
          </a>{' '}
          cover PFAS-specific sampling and advisories.
        </p>
      </div>

      {selected && (
        <SystemCard system={selected} thresholds={summary.thresholds} onShowTrend={onShowTrend} />
      )}
    </div>
  )
}
