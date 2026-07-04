import { useEffect, useMemo, useState } from 'react'
import { loadSummary, loadSystems } from './api.js'
import SearchView from './components/SearchView.jsx'
import TrendView from './components/TrendView.jsx'
import CountyView from './components/CountyView.jsx'
import RemediationView from './components/RemediationView.jsx'
import { fmtDate } from './format.js'
import badgeUrl from './assets/wpr-typewriter-badge.png'
import wordmarkUrl from './assets/wpr-wordmark.png'

const TABS = [
  { id: 'search', label: "What's in my water?" },
  { id: 'trends', label: 'Trend charts' },
  { id: 'counties', label: 'County board' },
  { id: 'remediation', label: 'Remediation tracker' },
]

function parseHash() {
  const m = window.location.hash.match(/^#\/(\w+)(?:\/([A-Za-z0-9]+))?/)
  if (!m || !TABS.some((t) => t.id === m[1])) return { tab: 'search', system: null }
  return { tab: m[1], system: m[2] || null }
}

export default function App() {
  const initial = useMemo(parseHash, [])
  const [tab, setTab] = useState(initial.tab)
  const [systemId, setSystemId] = useState(initial.system) // EPA pwsid
  const [summary, setSummary] = useState(null)
  const [systems, setSystems] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([loadSummary(), loadSystems()])
      .then(([sum, sys]) => {
        setSummary(sum)
        setSystems(sys)
      })
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    const want = systemId ? `#/${tab}/${systemId}` : `#/${tab}`
    if (window.location.hash !== want) window.history.replaceState(null, '', want)
  }, [tab, systemId])

  useEffect(() => {
    const onHash = () => {
      const h = parseHash()
      setTab(h.tab)
      if (h.system) setSystemId(h.system)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const goTo = (nextTab, nextSystemId) => {
    if (nextSystemId !== undefined) setSystemId(nextSystemId)
    setTab(nextTab)
  }

  return (
    <div className="app">
      <header className="masthead">
        <img
          className="badge-img"
          src={badgeUrl}
          alt="Wausau Pilot & Review typewriter badge"
          width="84"
          height="84"
        />
        <div>
          <a href="https://wausaupilotandreview.com" target="_blank" rel="noreferrer">
            <img className="wordmark-img" src={wordmarkUrl} alt="Wausau Pilot & Review" />
          </a>
          <h1>What&rsquo;s in the Water?</h1>
          <p className="dek">
            PFAS test results and drinking-water compliance for every public water system in
            Marathon, Lincoln, Langlade, Taylor, Shawano and Portage counties.
          </p>
        </div>
      </header>
      <div className="flag-rule" role="presentation" />

      <nav className="tabs" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <div className="error">Could not load data: {error}</div>}
      {!error && (!summary || !systems) && <div className="loading">Loading water system data…</div>}

      {summary && systems && (
        <main>
          {tab === 'search' && (
            <SearchView
              systems={systems}
              summary={summary}
              systemId={systemId}
              onSelect={(id) => setSystemId(id)}
              onShowTrend={(id) => goTo('trends', id)}
            />
          )}
          {tab === 'trends' && (
            <TrendView
              systems={systems}
              summary={summary}
              systemId={systemId}
              onSelect={(id) => setSystemId(id)}
            />
          )}
          {tab === 'counties' && (
            <CountyView systems={systems} summary={summary} onOpenSystem={(id) => goTo('search', id)} />
          )}
          {tab === 'remediation' && (
            <RemediationView
              systems={systems}
              onShowTrend={(id) => goTo('trends', id)}
              onOpenSystem={(id) => goTo('search', id)}
            />
          )}
        </main>
      )}

      {summary && (
        <footer className="foot">
          <p>
            <strong>Sources:</strong> PFAS results from the Wisconsin DNR{' '}
            <a href="https://apps.dnr.wi.gov/dwsportalpub" target="_blank" rel="noreferrer">
              Drinking Water System portal
            </a>{' '}
            ({summary.data_notes.dws}) Violations from EPA{' '}
            <a href="https://www.epa.gov/enviro/sdwis-search" target="_blank" rel="noreferrer">
              SDWIS
            </a>{' '}
            ({summary.data_notes.sdwis})
          </p>
          <p>{summary.data_notes.non_detects}</p>
          <p>
            Regulatory thresholds are shown as labeled reference lines for context only — they are
            not compliance determinations. MCL compliance is a running-annual-average calculation
            made by DNR and EPA, not by this tool.
          </p>
          <p>
            <strong>Download the data:</strong>{' '}
            <a href="data/processed/systems.json" download>
              systems
            </a>{' '}
            ·{' '}
            <a href="data/processed/pfas_results.json" download>
              PFAS sample results
            </a>{' '}
            ·{' '}
            <a href="data/processed/summary.json" download>
              summary
            </a>{' '}
            (JSON, updated weekly) — free to reuse with credit.
          </p>
          <p>Data last built {fmtDate(summary.built_at.slice(0, 10))}.</p>
          <p className="tagline">
            <a href="https://wausaupilotandreview.com" target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
              Wausau Pilot &amp; Review — More News. Less Fluff. All Local.
            </a>
          </p>
        </footer>
      )}
    </div>
  )
}
