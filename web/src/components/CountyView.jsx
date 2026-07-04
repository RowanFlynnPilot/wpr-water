import { useMemo, useState } from 'react'
import { fmtDate, fmtNum, titleCase, typeLabel } from '../format.js'

export default function CountyView({ systems, summary, onOpenSystem }) {
  const [county, setCounty] = useState(null) // null = all six

  const counties = Object.keys(summary.counties)

  const ranked = useMemo(() => {
    return systems
      .filter((s) => (county ? s.county === county : true))
      .filter((s) => s.violations.unresolved > 0)
      .sort(
        (a, b) =>
          b.violations.unresolved_health_based - a.violations.unresolved_health_based ||
          b.violations.unresolved - a.violations.unresolved ||
          a.name.localeCompare(b.name)
      )
  }, [systems, county])

  const scope = county || 'all six counties'

  return (
    <div>
      <div className="panel">
        <h2>County board</h2>
        <p className="subhead">
          Click a county to filter. &ldquo;Sampled&rdquo; counts systems with at least one PFAS
          test on record — most small systems have never been required to test.
        </p>
        <div className="county-grid">
          {counties.map((c) => {
            const d = summary.counties[c]
            return (
              <div
                key={c}
                className={`county-cell ${county === c ? 'selected' : ''}`}
                onClick={() => setCounty(county === c ? null : c)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setCounty(county === c ? null : c)}
              >
                <h4>{c}</h4>
                <div className="c-line">
                  <span>systems</span> <span className="mono">{d.systems}</span>
                </div>
                <div className="c-line">
                  <span>PFAS-sampled</span>{' '}
                  <span className="mono">
                    {d.sampled_for_pfas} of {d.systems}
                  </span>
                </div>
                <div className="c-line">
                  <span>with detections</span> <span className="mono">{d.with_pfas_detections}</span>
                </div>
                <div className="c-line">
                  <span>unresolved viol.</span>{' '}
                  <span className="mono">{d.with_unresolved_violations}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="panel">
        <h3>
          Systems with unresolved violations — {scope}{' '}
          <span className="chip rust">{ranked.length}</span>
        </h3>
        <p className="subhead">
          Ranked by unresolved health-based violations. &ldquo;Unresolved&rdquo; means EPA&rsquo;s
          record shows no return-to-compliance date.
        </p>
        <div className="table-scroll">
          <table className="board">
            <thead>
              <tr>
                <th>System</th>
                <th>County</th>
                <th>Type</th>
                <th className="num">Serves</th>
                <th className="num">Unresolved health-based</th>
                <th className="num">Unresolved total</th>
                <th>Latest violation</th>
                <th>PFAS tested?</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s) => (
                <tr key={s.pwsid}>
                  <td>
                    <button className="linklike" onClick={() => onOpenSystem(s.pwsid)}>
                      {titleCase(s.name)}
                    </button>
                  </td>
                  <td>{s.county}</td>
                  <td>{typeLabel(s)}</td>
                  <td className="num mono">{fmtNum(s.population)}</td>
                  <td className="num mono" style={s.violations.unresolved_health_based > 0 ? { color: '#a4443a', fontWeight: 700 } : undefined}>
                    {s.violations.unresolved_health_based}
                  </td>
                  <td className="num mono">{s.violations.unresolved}</td>
                  <td>{fmtDate(s.violations.latest_date)}</td>
                  <td>{s.pfas.sampled ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note warn">
          Federal SDWIS data refreshes quarterly from state submissions — some of these violations
          may already be resolved in DNR&rsquo;s records.
        </p>
      </div>
    </div>
  )
}
