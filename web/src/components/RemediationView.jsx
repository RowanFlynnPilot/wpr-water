import { MUNICIPAL_TRACKER_IDS, fmtCombined, fmtDate, fmtResult, titleCase } from '../format.js'

function Val({ label, entry }) {
  const r = fmtResult(entry)
  return (
    <div className="rv">
      <span className={`mono ${r.cls}`} title={r.title}>
        {r.cls === 'det' || r.cls === 'trace' ? entry.value : r.text}
      </span>
      {label}
    </div>
  )
}

export default function RemediationView({ systems, onShowTrend, onOpenSystem }) {
  const tracked = MUNICIPAL_TRACKER_IDS.map((id) => systems.find((s) => s.pwsid === id)).filter(Boolean)

  return (
    <div>
      <div className="panel">
        <h2>Remediation tracker</h2>
        <p className="subhead">
          The five Marathon County municipal systems where PFAS was found and treatment or
          monitoring is underway. Latest sample values shown in ng/L; open each trend chart for
          the full history.
        </p>
      </div>
      <div className="remed-grid">
        {tracked.map((s) => {
          const editorial = s.editorial && s.editorial.verified_by ? s.editorial : null
          const p = s.pfas
          return (
            <div className="remed-card" key={s.pwsid}>
              <h3>{titleCase(s.name)}</h3>
              <p className="subhead" style={{ marginBottom: 0 }}>
                Latest samples {fmtDate(p.latest_sample_date)}
              </p>
              <div className="remed-vals">
                <Val label="PFOA" entry={p.latest?.PFOA} />
                <Val label="PFOS" entry={p.latest?.PFOS} />
                <div className="rv">
                  <span className="mono">{fmtCombined(p)}</span>
                  PFOA+PFOS
                </div>
              </div>
              {editorial ? (
                <>
                  <p style={{ margin: '4px 0 8px' }}>
                    <strong>{editorial.headline}</strong>{' '}
                    {editorial.remediation_status && (
                      <span className="chip teal">{editorial.remediation_status}</span>
                    )}
                  </p>
                  <div className="narrative">
                    {editorial.narrative.split('\n').filter(Boolean).map((para, i) => (
                      <p key={i}>{para}</p>
                    ))}
                  </div>
                  {editorial.treatment && <p className="subhead">Treatment: {editorial.treatment}</p>}
                </>
              ) : (
                <p className="pending">
                  Remediation narrative pending newsroom verification — it will appear here once
                  signed off.
                </p>
              )}
              <p style={{ marginBottom: 0 }}>
                <button className="linklike" onClick={() => onShowTrend(s.pwsid)}>
                  Trend chart →
                </button>{' '}
                ·{' '}
                <button className="linklike" onClick={() => onOpenSystem(s.pwsid)}>
                  Full system card →
                </button>
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
