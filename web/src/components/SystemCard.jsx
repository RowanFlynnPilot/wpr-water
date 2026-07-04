import {
  KEY_ANALYTES,
  ANALYTE_LABELS,
  RESCISSION_ANALYTES,
  SOURCE_LABELS,
  VIOLATION_CATEGORY_LABELS,
  fmtCombined,
  fmtDate,
  fmtNum,
  fmtResult,
  otherAnalyteLabel,
  ruleName,
  titleCase,
  typeLabel,
} from '../format.js'

function AnalyteCell({ analyte, latest, historicMax }) {
  const entry = latest?.[analyte]
  const r = fmtResult(entry)
  const max = historicMax?.[analyte]
  return (
    <div className="analyte-cell">
      <div className="a-name">
        {ANALYTE_LABELS[analyte]}
        {RESCISSION_ANALYTES.has(analyte) && (
          <div className="a-flag" title="Federal MCL for this analyte was proposed for rescission May 18, 2026">
            MCL proposed for rescission
          </div>
        )}
      </div>
      <div className={`a-val ${r.cls}`} title={r.title}>
        {r.cls === 'trace' ? (
          <>
            {entry.value} <span className="unit">ng/L</span> <span className="tracemark">trace</span>
          </>
        ) : r.cls === 'det' ? (
          <>
            {entry.value} <span className="unit">ng/L</span>
          </>
        ) : (
          r.text
        )}
      </div>
      <div className="a-sub">
        {max?.value != null ? `historic max ${max.value} (${fmtDate(max.date)})` : 'never detected'}
      </div>
    </div>
  )
}

export default function SystemCard({ system: s, thresholds, onShowTrend }) {
  const p = s.pfas
  const v = s.violations
  const editorial = s.editorial && s.editorial.verified_by ? s.editorial : null

  return (
    <div>
      <div className="panel">
        <div className="syscard-head">
          <h2>{titleCase(s.name)}</h2>
          {!s.active && <span className="chip gray">Inactive</span>}
        </div>
        <p className="syscard-meta">
          {s.county} County · {typeLabel(s)} · Serves {fmtNum(s.population)} people
          {s.city_served ? ` in ${titleCase(s.city_served)}` : ''} ·{' '}
          {SOURCE_LABELS[s.primary_source_code] || s.primary_source_code} ·{' '}
          <span className="mono">{s.pwsid}</span>
          {s.pws_id_dnr && (
            <>
              {' '}
              · <span className="mono">DNR {s.pws_id_dnr}</span>
            </>
          )}
        </p>

        <h3>PFAS test results</h3>
        {!p.sampled ? (
          <p className="subhead">
            No PFAS sample results for this system in the DNR&rsquo;s drinking water database. Most
            small systems have not yet been required to test.
          </p>
        ) : (
          <>
            <p className="subhead">
              Latest samples {fmtDate(p.latest_sample_date)} · {p.n_results} results since{' '}
              {fmtDate(p.first_sample_date)} · {p.n_detections} detections ·{' '}
              <span
                className="help"
                title="Non-detects are shown as <LOD (below the limit of detection). Values marked “trace” were detected between the limits of detection and quantitation and are estimates."
              >
                how to read these numbers
              </span>
            </p>
            <div className="analyte-grid">
              {KEY_ANALYTES.map((a) => (
                <AnalyteCell key={a} analyte={a} latest={p.latest} historicMax={p.historic_max} />
              ))}
            </div>
            <div className="combined-row">
              <div>
                <div className="a-sub">Latest PFOA + PFOS combined</div>
                <span className="big">{fmtCombined(p)}</span>{' '}
                {fmtCombined(p) !== '<LOD' && <span className="threshold-note">ng/L</span>}
              </div>
              <div className="threshold-note">
                Wisconsin enforceable standard: <strong>{thresholds.wi_combined_pfoa_pfos.value} ng/L</strong>{' '}
                PFOA+PFOS combined (NR 809, Aug 2022)
                <br />
                Federal MCL: <strong>{thresholds.federal_mcl_pfoa.value.toFixed(1)} ng/L</strong> each for PFOA
                and PFOS (April 2024 rule; compliance deadline 2029, proposed extension to 2031)
              </div>
            </div>
            {p.other_detections && p.other_detections.length > 0 && (
              <p className="subhead" style={{ marginTop: 2 }}>
                Also detected at least once:{' '}
                {p.other_detections
                  .map(
                    (d) =>
                      `${otherAnalyteLabel(d.analyte)} (max ${d.max_value} ng/L, ${fmtDate(d.date)})`
                  )
                  .join(' · ')}
              </p>
            )}
            {onShowTrend && (
              <p style={{ marginBottom: 0 }}>
                <button className="linklike" onClick={() => onShowTrend(s.pwsid)}>
                  View the trend chart for this system →
                </button>
              </p>
            )}
            <p className="note">
              These are individual sample results as recorded by DNR, shown against labeled
              regulatory reference values — not compliance determinations, which DNR and EPA make
              on running annual averages.
            </p>
          </>
        )}
      </div>

      <div className="panel">
        <h3>Safe Drinking Water Act violations</h3>
        {v.total === 0 ? (
          <p className="subhead">No violations on record for this system in EPA&rsquo;s SDWIS database.</p>
        ) : (
          <>
            <div className="viol-stats">
              <div className="viol-stat">
                <div className="v-num">{v.total}</div>
                <div className="v-label">total on record</div>
              </div>
              <div className="viol-stat">
                <div className="v-num">{v.health_based}</div>
                <div className="v-label">health-based</div>
              </div>
              <div className="viol-stat">
                <div className={`v-num ${v.unresolved > 0 ? 'bad' : ''}`}>{v.unresolved}</div>
                <div className="v-label">unresolved</div>
              </div>
              <div className="viol-stat">
                <div className={`v-num ${v.unresolved_health_based > 0 ? 'bad' : ''}`}>
                  {v.unresolved_health_based}
                </div>
                <div className="v-label">unresolved &amp; health-based</div>
              </div>
              <div className="viol-stat">
                <div className="v-num">{v.since_2020}</div>
                <div className="v-label">since 2020</div>
              </div>
            </div>
            {v.oldest_unresolved_date && (
              <p className="subhead">
                Oldest unresolved violation open since{' '}
                <strong>{fmtDate(v.oldest_unresolved_date)}</strong>
                {v.oldest_unresolved_hb_date &&
                  ` — oldest unresolved health-based since ${fmtDate(v.oldest_unresolved_hb_date)}`}
                . &ldquo;Unresolved&rdquo; means EPA&rsquo;s record shows no return-to-compliance
                date.
              </p>
            )}
            {v.detail && v.detail.length > 0 && (
              <div className="table-scroll">
                <table className="board">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Rule</th>
                      <th>Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {v.detail.map((d, i) => (
                      <tr key={i}>
                        <td>{fmtDate(d.begin_date)}</td>
                        <td>{ruleName(d.rule_code)}</td>
                        <td>
                          {VIOLATION_CATEGORY_LABELS[d.category] || d.category}
                          {d.health_based && (
                            <>
                              {' '}
                              <span className="chip rust">health-based</span>
                            </>
                          )}
                        </td>
                        <td>
                          {d.resolved ? (
                            `resolved ${fmtDate(d.rtc_date)}`
                          ) : (
                            <strong style={{ color: '#cf2e2e' }}>open</strong>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {v.detail_omitted > 0 && (
              <p className="subhead" style={{ marginTop: 6 }}>
                Showing the {v.detail.length} most recent of {v.total} violations on record.
              </p>
            )}
          </>
        )}
        <p className="note warn">
          Federal SDWIS data refreshes quarterly from state submissions — violations here can lag
          DNR&rsquo;s own records by up to a quarter.
        </p>
      </div>

      {editorial && (
        <div className="panel">
          <h3>{editorial.headline}</h3>
          {editorial.remediation_status && (
            <p>
              <span className="chip teal">{editorial.remediation_status}</span>
            </p>
          )}
          <div className="narrative">
            {editorial.narrative.split('\n').filter(Boolean).map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          {editorial.treatment && (
            <p className="subhead" style={{ marginBottom: 0 }}>
              Treatment: {editorial.treatment}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
