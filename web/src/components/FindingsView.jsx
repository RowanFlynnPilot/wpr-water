import { useMemo } from 'react'
import {
  DIRECTION,
  HAZARD_INDEX,
  fmtDate,
  fmtMonthYear,
  fmtNum,
  fmtTrendValue,
  titleCase,
  typeLabel,
} from '../format.js'

function Direction({ trend }) {
  if (!trend) return <span className="result-meta">—</span>
  const d = DIRECTION[trend.direction]
  return (
    <span
      style={{ color: d.color, fontWeight: 700, whiteSpace: 'nowrap' }}
      title={`${fmtTrendValue(trend.prior_value)} → ${fmtTrendValue(trend.latest_value)} (${fmtMonthYear(trend.prior_date)} → ${fmtMonthYear(trend.latest_date)}), highest result per sampling round`}
    >
      {d.arrow} {d.label}
    </span>
  )
}

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

    const hazardOver = sampled
      .map((s) => ({
        s,
        max: s.pfas?.historic_max?.[HAZARD_INDEX],
        latest: s.pfas?.latest?.[HAZARD_INDEX],
      }))
      .filter(({ max }) => (max?.value ?? 0) > 1)
      .sort((a, b) => b.max.value - a.max.value)

    const nitrateOver = systems
      .filter((s) => (s.chem?.nitrate?.latest?.value ?? 0) > NITRATE_MCL)
      .sort((a, b) => b.chem.nitrate.latest.value - a.chem.nitrate.latest.value)

    // Direction between the last two sampling rounds, PFOA or PFOS.
    const withTrend = sampled.flatMap((s) =>
      ['PFOA', 'PFOS']
        .filter((a) => s.pfas?.trend?.[a])
        .map((a) => ({ s, analyte: a, tr: s.pfas.trend[a] }))
    )
    const rising = withTrend
      .filter(({ tr }) => tr.direction === 'rising' && (tr.latest_value ?? 0) >= 2)
      .sort((a, b) => (b.tr.latest_value ?? 0) - (a.tr.latest_value ?? 0))
    const falling = withTrend
      .filter(({ tr }) => tr.direction === 'falling' && (tr.prior_value ?? 0) >= FEDERAL_MCL)
      .sort((a, b) => (b.tr.prior_value ?? 0) - (a.tr.prior_value ?? 0))

    const leadCopper = systems
      .filter((s) => s.echo && (s.echo.pb_ale || s.echo.cu_ale))
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))

    const untested = systems
      .filter((s) => s.active && !s.pfas?.sampled && (s.population ?? 0) >= 500)
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))

    return {
      hazardOver,
      leadCopper,
      rising,
      falling,
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
                <th>Direction</th>
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
                    <td>
                      <Direction trend={s.pfas?.trend?.[w.analyte]} />
                    </td>
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

      {(f.rising.length > 0 || f.falling.length > 0) && (
        <div className="panel">
          <h3>Getting worse, getting better</h3>
          <p className="subhead">
            Direction between each system&rsquo;s last two sampling rounds, scored by the highest
            result across entry points in each round. A change has to be both 20% and at least
            0.5 ng/L to count — smaller moves read as steady. Rising results are shown where the
            latest is at least 2 ng/L; falling results where the prior round was above the federal
            limit.
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
                  <th>Analyte</th>
                  <th className="num">Prior → latest (ng/L)</th>
                  <th>Rounds</th>
                  <th>Direction</th>
                </tr>
              </thead>
              <tbody>
                {[...f.rising, ...f.falling].map(({ s, analyte, tr }) => (
                  <tr key={`${s.pwsid}-${analyte}`}>
                    <td>
                      <SystemLink s={s} onOpenSystem={onOpenSystem} />
                      <div className="result-meta">{typeLabel(s)}</div>
                    </td>
                    <td>{s.county}</td>
                    <td>{analyte}</td>
                    <td className="num mono">
                      {fmtTrendValue(tr.prior_value)} → {fmtTrendValue(tr.latest_value)}
                    </td>
                    <td>
                      {fmtMonthYear(tr.prior_date)} → {fmtMonthYear(tr.latest_date)}
                    </td>
                    <td>
                      <Direction trend={tr} />{' '}
                      <button className="linklike" onClick={() => onShowTrend(s.pwsid)}>
                        chart
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Two rounds is a direction, not a verdict. Open the chart before drawing conclusions —
            a single entry point coming back online, a seasonal swing, or a switched source can
            move one round on its own.
          </p>
        </div>
      )}

      {f.hazardOver.length > 0 && (
        <div className="panel">
          <h3>Above the standard EPA has proposed to rescind</h3>
          <p className="subhead">
            The EPA PFAS Hazard Index is a unitless combined measure for PFHxS, PFNA, HFPO-DA
            (GenX) and PFBS, computed by DNR. Its federal limit of 1.0 — along with the
            individual limits for those first three compounds — was{' '}
            <strong>proposed for rescission on May 18, 2026</strong>. DNR began reporting the
            index in January 2026, so every result on record falls in this year. These{' '}
            {f.hazardOver.length} systems have recorded results above it.
          </p>
          <div className="table-scroll">
            <table className="board">
              <thead>
                <tr>
                  <th>System</th>
                  <th>County</th>
                  <th className="num">Serves</th>
                  <th className="num">Highest index</th>
                  <th>Recorded</th>
                  <th className="num">Most recent result</th>
                </tr>
              </thead>
              <tbody>
                {f.hazardOver.map(({ s, max, latest: l }) => (
                  <tr key={s.pwsid}>
                    <td>
                      <SystemLink s={s} onOpenSystem={onOpenSystem} />
                      <div className="result-meta">{typeLabel(s)}</div>
                    </td>
                    <td>{s.county}</td>
                    <td className="num mono">{fmtNum(s.population)}</td>
                    <td className="num mono" style={{ color: '#cf2e2e', fontWeight: 700 }}>
                      {max.value}
                    </td>
                    <td>{fmtDate(max.date)}</td>
                    <td className="num mono">
                      {l?.value != null ? l.value : 'non-detect'}
                      {l?.date && (
                        <div className="result-meta">{fmtDate(l.date)}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note warn">
            A system samples each entry point to its distribution system separately, and the most
            recent result may come from a <em>different</em> entry point than the one that ran
            high — a later non-detect does not necessarily mean the elevated source was
            re-tested. Rib Mountain&rsquo;s 2.60 was one of four entry points sampled on March 12,
            2026; that entry point has no newer result on record. Open each system&rsquo;s trend
            chart for the per-entry-point picture.
          </p>
        </div>
      )}

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
                  <th>Direction</th>
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
                    <td>
                      <Direction trend={s.chem.nitrate.trend} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {f.leadCopper.length > 0 && (
        <div className="panel">
          <h3>Lead or copper action level exceeded</h3>
          <p className="subhead">
            EPA&rsquo;s current record flags these systems&rsquo; 90th-percentile tap results
            above the Lead and Copper Rule action levels (15 µg/L lead, 1,300 µg/L copper) —
            the trigger for corrosion control and public education. An action level is not an
            MCL, but it is the closest thing federal law has to a lead limit at the tap.
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
                  <th className="num">Serves</th>
                  <th>Exceeded</th>
                  <th>Last sanitary survey</th>
                </tr>
              </thead>
              <tbody>
                {f.leadCopper.map((s) => (
                  <tr key={s.pwsid}>
                    <td>
                      <SystemLink s={s} onOpenSystem={onOpenSystem} />
                      <div className="result-meta">{typeLabel(s)}</div>
                    </td>
                    <td>{s.county}</td>
                    <td className="num mono">{fmtNum(s.population)}</td>
                    <td>
                      {s.echo.pb_ale && <span className="chip rust">Lead</span>}{' '}
                      {s.echo.cu_ale && <span className="chip rust">Copper</span>}
                    </td>
                    <td>{s.echo.last_sanitary_survey ? fmtDate(s.echo.last_sanitary_survey) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {summary.pfas_sites && summary.pfas_sites.length > 0 && (
        <div className="panel">
          <h3>PFAS contamination sites under DNR investigation</h3>
          <p className="subhead">
            DNR&rsquo;s open PFAS sites in the coverage area, with the contamination source as
            DNR records it. These are the places the chemicals came <em>from</em>; the water
            systems above are where they show up.
          </p>
          <p className="scroll-hint" aria-hidden="true">
            swipe sideways to see the full table →
          </p>
          <div className="table-scroll">
            <table className="board">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>County</th>
                  <th>Source</th>
                  <th>Media affected</th>
                  <th>Drinking water affected?</th>
                </tr>
              </thead>
              <tbody>
                {summary.pfas_sites.map((site) => (
                  <tr key={`${site.county}-${site.name}`}>
                    <td>
                      {site.botw_url ? (
                        <a href={site.botw_url} target="_blank" rel="noreferrer">
                          {site.name}
                        </a>
                      ) : (
                        site.name
                      )}
                    </td>
                    <td>{site.county}</td>
                    <td>{site.sources || '—'}</td>
                    <td>{site.media || '—'}</td>
                    <td>{site.drinking_water_affected || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="note">
            Source: DNR EM_PFAS map service, open sites layer; each site links to its DNR BRRTS
            record. &ldquo;Drinking water affected&rdquo; is DNR&rsquo;s own flag.
          </p>
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
