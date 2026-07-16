import {
  KEY_ANALYTES,
  ANALYTE_LABELS,
  CHEM_LABELS,
  RESCISSION_ANALYTES,
  SOURCE_LABELS,
  VIOLATION_CATEGORY_LABELS,
  calmCase,
  fmtCombined,
  fmtDate,
  fmtNum,
  fmtResult,
  otherAnalyteLabel,
  ruleName,
  titleCase,
  typeLabel,
  unitLabel,
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

const QTR_STATUS = {
  V: { color: '#607d8b', label: 'violation' },
  S: { color: '#cf2e2e', label: 'significant noncompliance' },
}

// ECHO's SDWA3yrComplQtrsHistory: one character per tracked quarter,
// oldest first. Blank/dash = no violation on EPA's record.
function QuarterStrip({ history }) {
  const quarters = history.split('')
  return (
    <div style={{ margin: '10px 0 4px' }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {quarters.map((ch, i) => {
          const st = QTR_STATUS[ch]
          return (
            <span
              key={i}
              title={`Quarter ${i + 1} of ${quarters.length} (oldest → newest): ${st ? st.label : 'no violation'}`}
              style={{
                width: 18,
                height: 18,
                background: st ? st.color : '#efece4',
                border: '1px solid #ddd',
                borderRadius: 2,
              }}
            />
          )
        })}
      </div>
      <div className="chart-legend" style={{ marginTop: 6 }}>
        <span>
          <span style={{ display: 'inline-block', width: 11, height: 11, background: '#efece4', border: '1px solid #ddd', verticalAlign: 'middle', marginRight: 5 }} />
          no violation
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 11, height: 11, background: '#607d8b', verticalAlign: 'middle', marginRight: 5 }} />
          violation
        </span>
        <span>
          <span style={{ display: 'inline-block', width: 11, height: 11, background: '#cf2e2e', verticalAlign: 'middle', marginRight: 5 }} />
          significant noncompliance
        </span>
        <span>oldest → newest, EPA&rsquo;s tracked quarters</span>
      </div>
    </div>
  )
}

function ChemCell({ chemKey, entry, reference }) {
  const r = fmtResult(entry.latest)
  const unit = unitLabel(entry.latest.units)
  return (
    <div className="analyte-cell">
      <div className="a-name">{CHEM_LABELS[chemKey]}</div>
      <div className={`a-val ${r.cls}`} title={r.title}>
        {r.cls === 'det' || r.cls === 'trace' ? (
          <>
            {entry.latest.value} <span className="unit">{unit}</span>
            {r.cls === 'trace' && <span className="tracemark"> trace</span>}
          </>
        ) : (
          r.text
        )}
      </div>
      <div className="a-sub">
        {fmtDate(entry.latest.date)} · {entry.latest.sample_source === 'Distribution System' ? 'tap sample' : 'entry point'}
        <br />
        {entry.historic_max
          ? `max since 2020: ${entry.historic_max.value} ${unitLabel(entry.historic_max.units)}`
          : 'never detected since 2020'}
        {reference && (
          <>
            <br />
            <span title={reference.label}>
              ref: {reference.value} {unitLabel(reference.units)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

export default function SystemCard({ system: s, thresholds, chemReferences, cleanupSitesByCity, onShowTrend }) {
  const cleanupCount = s.city_served ? cleanupSitesByCity?.[s.city_served.toUpperCase()] : null
  const p = s.pfas
  const v = s.violations
  const editorial = s.editorial && s.editorial.verified_by ? s.editorial : null

  return (
    <div>
      <div className="panel">
        <div className="syscard-head">
          <h2>{titleCase(s.name)}</h2>
          {s.echo?.serious_violator && (
            <span className="chip rust" title="EPA's current Serious Violator designation — see the violations section below">
              EPA serious violator
            </span>
          )}
          {!s.active && <span className="chip gray">Inactive</span>}
        </div>
        {s.echo?.serious_violator && (
          <p className="subhead" style={{ marginBottom: 6 }}>
            Flagged by EPA for unresolved Safe Drinking Water Act violations
            {s.echo.contaminants_in_cur_viol.length > 0 &&
              ` under: ${s.echo.contaminants_in_cur_viol.map(calmCase).join(', ')}`}{' '}
            — not for the PFAS results below. Details in the violations section.
          </p>
        )}
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

      {s.chem && Object.keys(s.chem).length > 0 && (
        <div className="panel">
          <h3>Nitrate, arsenic, lead &amp; copper</h3>
          <p className="subhead">
            Most recent DNR-recorded sample since 2020 for the classic regulated contaminants.
            Reference values are shown for context, not as compliance findings.
          </p>
          <div className="analyte-grid">
            {Object.entries(s.chem).map(([key, entry]) => (
              <ChemCell key={key} chemKey={key} entry={entry} reference={chemReferences?.[key]} />
            ))}
          </div>
          {(s.chem.lead || s.chem.copper) && (
            <p className="note">
              Lead and copper results are individual tap samples. Compliance is assessed by
              DNR/EPA on the 90th percentile of a sampling round — a single tap value above the
              action level is not by itself a violation.
            </p>
          )}
        </div>
      )}

      <div className="panel">
        <h3>Safe Drinking Water Act violations</h3>
        {s.echo?.serious_violator && (
          <p>
            <span className="chip rust">EPA serious violator</span>{' '}
            <span className="threshold-note">
              EPA&rsquo;s current designation: {s.echo.qtrs_with_snc} of the last 12 quarters in
              significant noncompliance, {s.echo.qtrs_with_vio} with violations
              {s.echo.contaminants_in_cur_viol.length > 0 &&
                ` — currently in violation under: ${s.echo.contaminants_in_cur_viol.map(calmCase).join(', ')}`}
              .
            </span>
          </p>
        )}
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
        {s.echo?.compl_qtrs_history && s.echo.qtrs_with_vio > 0 && (
          <QuarterStrip history={s.echo.compl_qtrs_history} />
        )}
        {(v.enforcement || s.echo?.last_formal_action || s.echo?.last_informal_action) && (
          <p className="subhead" style={{ marginTop: 10, marginBottom: 0 }}>
            Enforcement on EPA&rsquo;s record:
            {v.enforcement &&
              ` ${v.enforcement.total} action${v.enforcement.total === 1 ? '' : 's'} since ${fmtDate(
                v.enforcement.first_date
              )}${v.enforcement.federal > 0 ? ` (${v.enforcement.federal} federal)` : ''}`}
            {v.enforcement && (s.echo?.last_informal_action || s.echo?.last_formal_action) && ' ·'}
            {s.echo?.last_informal_action &&
              ` last informal action ${fmtDate(s.echo.last_informal_action)}`}
            {s.echo?.last_informal_action && s.echo?.last_formal_action && ' ·'}
            {s.echo?.last_formal_action &&
              ` last formal action ${fmtDate(s.echo.last_formal_action)}`}
            .
          </p>
        )}
        <p className="note warn">
          Federal SDWIS and ECHO data refresh quarterly from state submissions — violations here
          can lag DNR&rsquo;s own records by up to a quarter.
        </p>
      </div>

      {cleanupCount > 0 && (
        <div className="panel">
          <h3>Contamination cleanup nearby</h3>
          <p className="subhead" style={{ marginBottom: 0 }}>
            DNR&rsquo;s remediation tracking database (BRRTS) lists{' '}
            <strong>
              {cleanupCount} open cleanup {cleanupCount === 1 ? 'activity' : 'activities'}
            </strong>{' '}
            in {titleCase(s.city_served)} — all types, from spills and leaking tanks to
            long-term environmental repair, not necessarily affecting this water system. Look
            them up on{' '}
            <a
              href="https://dnr.wisconsin.gov/topic/Brownfields/BOTW.html"
              target="_blank"
              rel="noreferrer"
            >
              BRRTS on the Web
            </a>
            .
          </p>
        </div>
      )}

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
