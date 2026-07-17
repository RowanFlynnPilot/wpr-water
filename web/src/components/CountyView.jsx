import { useMemo, useState } from 'react'
import { fmtDate, fmtNum, titleCase, typeLabel } from '../format.js'

const RANKED_PREVIEW = 25

export default function CountyView({ systems, summary, onOpenSystem }) {
  const [county, setCounty] = useState(null) // null = all six
  const [showAll, setShowAll] = useState(false)

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

  const scope = county || `all ${counties.length} counties`

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
                {d.population_served > 0 && (
                  <div
                    className="c-line"
                    title={`${d.population_pfas_sampled.toLocaleString()} of ${d.population_served.toLocaleString()} people served by public systems get water from a PFAS-tested system. Most untested systems are small.`}
                  >
                    <span>people covered by a test</span>{' '}
                    <span className="mono">
                      {Math.round((d.population_pfas_sampled / d.population_served) * 100)}%
                    </span>
                  </div>
                )}
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
        <p className="scroll-hint" aria-hidden="true">
          swipe sideways to see the full table →
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
                <th>Open since</th>
                <th>PFAS tested?</th>
              </tr>
            </thead>
            <tbody>
              {(showAll ? ranked : ranked.slice(0, RANKED_PREVIEW)).map((s) => (
                <tr key={s.pwsid}>
                  <td>
                    <button className="linklike" onClick={() => onOpenSystem(s.pwsid)}>
                      {titleCase(s.name)}
                    </button>
                    {s.echo?.serious_violator && (
                      <>
                        {' '}
                        <span className="chip rust" title="EPA's current Serious Violator designation">
                          EPA serious violator
                        </span>
                      </>
                    )}
                  </td>
                  <td>{s.county}</td>
                  <td>{typeLabel(s)}</td>
                  <td className="num mono">{fmtNum(s.population)}</td>
                  <td className="num mono" style={s.violations.unresolved_health_based > 0 ? { color: '#a4443a', fontWeight: 700 } : undefined}>
                    {s.violations.unresolved_health_based}
                  </td>
                  <td className="num mono">{s.violations.unresolved}</td>
                  <td>{fmtDate(s.violations.oldest_unresolved_hb_date || s.violations.oldest_unresolved_date)}</td>
                  <td>{s.pfas.sampled ? 'yes' : 'no'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {ranked.length > RANKED_PREVIEW && (
          <p style={{ margin: '10px 0 0' }}>
            <button className="linklike" onClick={() => setShowAll(!showAll)}>
              {showAll
                ? 'Show fewer'
                : `Show all ${ranked.length} systems with unresolved violations →`}
            </button>
          </p>
        )}
        <p className="note warn">
          Federal SDWIS data refreshes quarterly from state submissions — some of these violations
          may already be resolved in DNR&rsquo;s records.
        </p>
      </div>

      {Object.values(summary.counties).some((c) => c.private_wells) && (
        <div className="panel">
          <h3>Private wells: the other half of the picture</h3>
          <p className="subhead">
            Public systems are tested and tracked; private wells are only tested when their
            owners order a test. These county aggregates come from voluntary homeowner samples
            analyzed since 1985 — long-run context, not current conditions. PFAS is not among
            the tested parameters.
          </p>
          <p className="scroll-hint" aria-hidden="true">
            swipe sideways to see the full table →
          </p>
          <div className="table-scroll">
            <table className="board">
              <thead>
                <tr>
                  <th>County</th>
                  <th className="num">Nitrate samples</th>
                  <th className="num">Median (mg/L)</th>
                  <th className="num">% over 10 mg/L standard</th>
                  <th className="num">Coliform samples</th>
                  <th className="num">% positive</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(summary.counties)
                  .filter(([, c]) => c.private_wells)
                  .map(([name, c]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td className="num mono">{fmtNum(c.private_wells.nitrate?.samples)}</td>
                      <td className="num mono">{c.private_wells.nitrate?.median ?? '—'}</td>
                      <td className="num mono" style={(c.private_wells.nitrate?.exceedance_pct ?? 0) >= 15 ? { color: '#a4443a', fontWeight: 700 } : undefined}>
                        {c.private_wells.nitrate?.exceedance_pct ?? '—'}%
                      </td>
                      <td className="num mono">{fmtNum(c.private_wells.bacteria?.samples)}</td>
                      <td className="num mono">{c.private_wells.bacteria?.positive_pct ?? '—'}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Source: UW-Stevens Point Center for Watershed Science and Education,{' '}
            <a
              href="https://www.uwsp.edu/cwse/wisconsin-well-water-quality-viewer/"
              target="_blank"
              rel="noreferrer"
            >
              Wisconsin Well Water Quality Viewer
            </a>
            . County averages are no substitute for testing your own well.
          </p>
        </div>
      )}

      {summary.fish_advisories && summary.fish_advisories.length > 0 && (
        <div className="panel">
          <h3>PFAS fish consumption advisories on area waters</h3>
          <p className="subhead">
            The same PFOS found in drinking-water wells also accumulates in fish. DNR and DHS
            have issued special consumption advice for these waters in and around the coverage
            area:
          </p>
          <p className="scroll-hint" aria-hidden="true">
            swipe sideways to see the full table →
          </p>
          <div className="table-scroll">
            <table className="board">
              <thead>
                <tr>
                  <th>Waters</th>
                  <th>Contaminants</th>
                  <th>Advice</th>
                  <th>Effective</th>
                </tr>
              </thead>
              <tbody>
                {summary.fish_advisories.map((a) => (
                  <tr key={a.description}>
                    <td>{titleCase(a.name || a.description)}</td>
                    <td>{a.contaminants}</td>
                    <td>{a.advice_type}</td>
                    <td>{a.effective ? fmtDate(a.effective) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Advisory designations as recorded by DNR. Specific meal-frequency advice by species
            is at{' '}
            <a
              href="https://dnr.wisconsin.gov/topic/Fishing/consumption"
              target="_blank"
              rel="noreferrer"
            >
              dnr.wisconsin.gov/topic/Fishing/consumption
            </a>
            .
          </p>
        </div>
      )}
    </div>
  )
}
