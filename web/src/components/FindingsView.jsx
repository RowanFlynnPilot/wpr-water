import { useMemo } from 'react'
import { fmtDate, fmtNum, titleCase, typeLabel } from '../format.js'

const FEDERAL_MCL = 4.0
const NITRATE_MCL = 10

const latest = (s, a) => {
  const e = s.pfas?.latest?.[a]
  return e && e.value != null ? e : null
}

// The worse of the system's two latest key results, for ranking.
function worstPfas(s) {
  const a = latest(s, 'PFOA')
  const b = latest(s, 'PFOS')
  if (!a && !b) return null
  if (!b || (a && a.value >= b.value)) return { analyte: 'PFOA', ...a }
  return { analyte: 'PFOS', ...b }
}

function SystemLink({ s, onOpenSystem }) {
  return (
    <button className="linklike" onClick={() => onOpenSystem(s.pwsid)}>
      {titleCase(s.name)}
    </button>
  )
}

export default function FindingsView({ systems, summary, onOpenSystem, onShowTrend }) {
  const f = useMemo(() => {
    const sampled = systems.filter((s) => s.pfas?.sampled)

    const overMcl = sampled
      .map((s) => ({ s, w: worstPfas(s) }))
      .filter(({ w }) => w && w.value > FEDERAL_MCL)
      .sort((a, b) => b.w.value - a.w.value)

    const nitrateOver = systems
      .filter((s) => (s.chem?.nitrate?.latest?.value ?? 0) > NITRATE_MCL)
      .sort((a, b) => b.chem.nitrate.latest.value - a.chem.nitrate.latest.value)

    const untested = systems
      .filter((s) => s.active && !s.pfas?.sampled && (s.population ?? 0) >= 500)
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))

    return {
      overMcl,
      overMclPop: overMcl.reduce((n, { s }) => n + (s.population ?? 0), 0),
      nitrateOver,
      untested,
      untestedPop: untested.reduce((n, s) => n + (s.population ?? 0), 0),
      sampledCount: sampled.length,
    }
  }, [systems])

  return (
    <div>
      <div className="panel">
        <h2>What the data shows</h2>
        <p className="subhead">
          The findings below are drawn from the same DNR and EPA records behind every system page
          — ranked so the systems with the highest recorded results are visible without knowing
          which one to look up. Every figure links to the system it came from.
        </p>

        <div className="viol-stats">
          <div className="viol-stat">
            <div className="v-num bad">{f.overMcl.length}</div>
            <div className="v-label">
              systems whose latest PFAS sample is above the federal limit
            </div>
          </div>
          <div className="viol-stat">
            <div className="v-num bad">{fmtNum(f.overMclPop)}</div>
            <div className="v-label">people served — homes, workplaces and schools</div>
          </div>
          <div className="viol-stat">
            <div className="v-num">{f.sampledCount}</div>
            <div className="v-label">
              of {fmtNum(summary.counts.systems)} systems tested for PFAS at all
            </div>
          </div>
        </div>
        <p className="note warn">
          These are individual sample results measured against a labeled reference value — not
          compliance determinations. DNR and EPA decide compliance using a running annual average,
          and a system above the line here may not be in violation.
        </p>
      </div>

      <div className="panel">
        <h3>Latest PFAS sample above the federal limit</h3>
        <p className="subhead">
          The federal limit is {FEDERAL_MCL.toFixed(1)} ng/L each for PFOA and PFOS (April 2024
          rule; compliance deadline 2029, with an extension to 2031 proposed in May 2026). Ranked
          by the higher of the two most recent results.
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
                <th>Serves</th>
                <th className="num">Latest result</th>
                <th className="num">× the limit</th>
                <th>Sampled</th>
                <th className="num">Highest ever</th>
              </tr>
            </thead>
            <tbody>
              {f.overMcl.map(({ s, w }) => {
                const hist = s.pfas?.historic_max?.[w.analyte]
                return (
                  <tr key={s.pwsid}>
                    <td>
                      <SystemLink s={s} onOpenSystem={onOpenSystem} />
                      <div className="result-meta">{typeLabel(s)}</div>
                    </td>
                    <td>{s.county}</td>
                    <td className="mono">{fmtNum(s.population)}</td>
                    <td className="num mono" style={{ color: '#cf2e2e', fontWeight: 700 }}>
                      {w.value} <span style={{ fontSize: 11 }}>{w.analyte}</span>
                    </td>
                    <td className="num mono">{Math.round(w.value / FEDERAL_MCL)}×</td>
                    <td>{fmtDate(w.date)}</td>
                    <td className="num mono">
                      {hist ? `${hist.value}` : '—'}
                      {hist && (
                        <>
                          {' '}
                          <button className="linklike" onClick={() => onShowTrend(s.pwsid)}>
                            trend
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="note">
          Systems marked <em>non-transient, non-community</em> or <em>transient</em> serve
          workplaces, schools, campgrounds and taverns rather than homes — the &ldquo;serves&rdquo;
          figure counts the people who drink from that tap during the day, not households.
        </p>
      </div>

      {f.nitrateOver.length > 0 && (
        <div className="panel">
          <h3>Latest nitrate sample above the {NITRATE_MCL} mg/L limit</h3>
          <p className="subhead">
            Nitrate is the contaminant most often found above its limit in this area, and the
            standard exists chiefly to protect infants.
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
                  <th>Serves</th>
                  <th className="num">Latest (mg/L)</th>
                  <th>Sampled</th>
                  <th className="num">Highest since 2020</th>
                </tr>
              </thead>
              <tbody>
                {f.nitrateOver.map((s) => (
                  <tr key={s.pwsid}>
                    <td>
                      <SystemLink s={s} onOpenSystem={onOpenSystem} />
                      <div className="result-meta">{typeLabel(s)}</div>
                    </td>
                    <td>{s.county}</td>
                    <td className="mono">{fmtNum(s.population)}</td>
                    <td className="num mono" style={{ color: '#cf2e2e', fontWeight: 700 }}>
                      {s.chem.nitrate.latest.value}
                    </td>
                    <td>{fmtDate(s.chem.nitrate.latest.date)}</td>
                    <td className="num mono">{s.chem.nitrate.historic_max?.value ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <h3>Never tested for PFAS</h3>
        <p className="subhead">
          Only {f.sampledCount} of {fmtNum(summary.counts.systems)} public systems in the coverage
          area have a PFAS result on record. Absence of testing is not evidence of clean water.
          These are the largest systems with no PFAS sample at all — {f.untested.length} systems
          serving {fmtNum(f.untestedPop)} people.
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
              </tr>
            </thead>
            <tbody>
              {f.untested.map((s) => (
                <tr key={s.pwsid}>
                  <td>
                    <SystemLink s={s} onOpenSystem={onOpenSystem} />
                  </td>
                  <td>{s.county}</td>
                  <td>{typeLabel(s)}</td>
                  <td className="num mono">{fmtNum(s.population)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
