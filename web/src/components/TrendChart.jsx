import { useMemo, useState } from 'react'
import { fmtDate } from '../format.js'

const W = 760
const H = 300
const M = { top: 30, right: 16, bottom: 32, left: 46 }
const IW = W - M.left - M.right
const IH = H - M.top - M.bottom

// entry point 0 is a solid line at full weight; later ones are lighter and dashed
const EP_DASH = ['', '5 4', '2 3', '8 3 2 3']
const EP_OPACITY = [1, 0.6, 0.55, 0.5]
const EP_WIDTH = [2, 1.5, 1.5, 1.5]
const EP_SHAPE = ['circle', 'square', 'triangle', 'diamond']

// Above this many entry points, per-entry-point lines turn to spaghetti:
// switch to dots-for-every-sample plus one max-per-date line per analyte.
const MAX_EP_LINES = 3

// Never connect samples further apart than this — a line across a years-long
// sampling gap reads as data that isn't there.
const GAP_MS = 456 * 86400e3 // ~15 months

function niceStep(range) {
  const raw = range / 6
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (raw <= m * pow) return m * pow
  }
  return 10 * pow
}

function splitOnGaps(pts) {
  const segments = []
  let cur = []
  for (const p of pts) {
    if (cur.length && Date.parse(p.date) - Date.parse(cur[cur.length - 1].date) > GAP_MS) {
      segments.push(cur)
      cur = []
    }
    cur.push(p)
  }
  if (cur.length) segments.push(cur)
  return segments
}

function MarkerShape({ shape, x, y, color, open, opacity, small }) {
  const fill = open ? '#fff' : color
  if (small) {
    return <circle cx={x} cy={y} r={2.6} fill={fill} stroke={color} strokeWidth={1.1} opacity={opacity} pointerEvents="none" />
  }
  const common = { fill, stroke: color, strokeWidth: 1.3, opacity, pointerEvents: 'none' }
  if (shape === 'square') return <rect x={x - 2.8} y={y - 2.8} width={5.6} height={5.6} {...common} />
  if (shape === 'triangle')
    return <polygon points={`${x},${y - 3.6} ${x - 3.4},${y + 2.7} ${x + 3.4},${y + 2.7}`} {...common} />
  if (shape === 'diamond')
    return <polygon points={`${x},${y - 3.8} ${x + 3.8},${y} ${x},${y + 3.8} ${x - 3.8},${y}`} {...common} />
  return <circle cx={x} cy={y} r={3} {...common} />
}

function Tooltip({ tip, unit }) {
  // position as a percentage of the chart box so it tracks the responsive SVG
  const left = (tip.x / W) * 100
  const top = (tip.y / H) * 100
  const style = { left: `${left}%`, top: `${top}%` }
  const tx = left > 72 ? 'calc(-100% - 10px)' : left < 28 ? '10px' : '-50%'
  const ty = top < 38 ? '14px' : 'calc(-100% - 12px)'
  style.transform = `translate(${tx}, ${ty})`

  const p = tip.point
  return (
    <div className="chart-tip" style={style} role="status">
      <div className="t-head">
        <span className="t-dot" style={{ background: tip.color }} />
        {tip.label}
      </div>
      <div className="t-val mono">
        {p.value == null ? (
          '<LOD'
        ) : (
          <>
            {p.value} <span className="t-unit">{unit}</span>
          </>
        )}
      </div>
      {p.value == null && <div className="t-qual">non-detect — below the limit of detection</div>}
      {p.qualifier === 'Between LOD and LOQ' && (
        <div className="t-qual">trace — between LOD and LOQ (estimated)</div>
      )}
      <div className="t-rows">
        <div>{fmtDate(p.date)}</div>
        <div>
          Entry point {p.source_id ?? 'unspecified'} · {p.sample_type} sample
        </div>
      </div>
    </div>
  )
}

/**
 * points: [{date, value|null, qualifier, source_id, sample_type, analyte}]
 * series: [{analyte, label, color}]
 * refLines: [{value, label}] — drawn only if they fit the scale;
 *           off-scale lines are reported back via a caption chip.
 * unit: axis label
 */
export default function TrendChart({ points, series, refLines = [], unit = 'ng/L' }) {
  const [tip, setTip] = useState(null)

  const model = useMemo(() => {
    const ts = points.map((p) => Date.parse(p.date))
    const tMin = Math.min(...ts)
    const tMax = Math.max(...ts)
    const pad = Math.max((tMax - tMin) * 0.03, 15 * 86400e3)
    const x0 = tMin - pad
    const x1 = tMax + pad

    const dataMax = Math.max(...points.map((p) => (p.value == null ? 0 : p.value)), 0)
    const drawn = refLines.filter((r) => r.value <= Math.max(dataMax, 1) * 2.5)
    const offScale = refLines.filter((r) => !drawn.includes(r))
    // Data gets 15% headroom; a reference line above the data only needs a
    // sliver, so it doesn't inflate the scale and crush low values.
    const yTop = Math.max(dataMax * 1.15, ...drawn.map((r) => r.value * 1.06), 0.5)
    const step = niceStep(yTop)
    const yMax = Math.ceil(yTop / step) * step

    const x = (t) => M.left + ((t - x0) / (x1 - x0)) * IW
    const y = (v) => M.top + IH - (v / yMax) * IH

    const yTicks = []
    for (let v = 0; v <= yMax + 1e-9; v += step) yTicks.push(Math.round(v * 100) / 100)

    const xTicks = []
    const startYear = new Date(x0).getUTCFullYear() + 1
    const endYear = new Date(x1).getUTCFullYear()
    for (let yr = startYear; yr <= endYear; yr++) xTicks.push({ t: Date.parse(`${yr}-01-01`), label: String(yr) })
    if (xTicks.length === 0) xTicks.push({ t: tMin, label: String(new Date(tMin).getUTCFullYear()) })

    // entry points, null last
    const eps = [...new Set(points.map((p) => p.source_id))].sort((a, b) =>
      a === b ? 0 : a == null ? 1 : b == null ? -1 : a - b
    )
    const manyEps = eps.length > MAX_EP_LINES

    // per-entry-point mode: one line per (analyte, entry point), split on gaps
    const lines = []
    if (!manyEps) {
      for (const s of series) {
        for (const ep of eps) {
          const pts = points
            .filter((p) => p.analyte === s.analyte && p.source_id === ep)
            .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
          if (pts.length) {
            lines.push({ ...s, ep, epIndex: eps.indexOf(ep), pts, segments: splitOnGaps(pts) })
          }
        }
      }
    }

    // many-entry-points mode: every sample as a dot, plus one line per
    // analyte through the highest result on each sampling date (all-ND
    // dates count as 0 so treatment shows).
    const maxLines = []
    const dots = []
    if (manyEps) {
      for (const s of series) {
        const mine = points.filter((p) => p.analyte === s.analyte)
        dots.push(...mine.map((p) => ({ p, series: s })))
        const byDate = new Map()
        for (const p of mine) {
          const v = p.value == null ? 0 : p.value
          if (!byDate.has(p.date) || v > byDate.get(p.date)) byDate.set(p.date, v)
        }
        const pts = [...byDate.entries()]
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        if (pts.length > 1) maxLines.push({ ...s, pts, segments: splitOnGaps(pts) })
      }
    }

    return { x, y, yMax, yTicks, xTicks, lines, maxLines, dots, eps, manyEps, drawn, offScale }
  }, [points, series, refLines])

  const { x, y, yTicks, xTicks, lines, maxLines, dots, eps, manyEps, drawn, offScale } = model
  const baseline = y(0)

  return (
    <div>
      <p className="scroll-hint" aria-hidden="true">
        swipe sideways to see the full chart →
      </p>
      <div className="chart-wrap">
        <div className="chart-box">
          <svg
            className="chart-svg"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label="PFAS trend chart"
            onMouseLeave={() => setTip(null)}
          >
            {/* horizontal grid + y labels */}
            {yTicks.map((v) => (
              <g key={v}>
                {v > 0 && (
                  <line x1={M.left} x2={W - M.right} y1={y(v)} y2={y(v)} stroke="#eeeeee" strokeWidth="1" />
                )}
                <text x={M.left - 9} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="#888" fontFamily="JetBrains Mono Variable, monospace">
                  {v}
                </text>
              </g>
            ))}
            {/* unit, horizontal, above the axis numbers */}
            <text x={M.left - 9} y={M.top - 10} textAnchor="end" fontSize="10.5" fill="#888" fontFamily="Oswald Variable, sans-serif" letterSpacing="0.06em">
              {unit}
            </text>

            {/* x axis baseline, year ticks + labels */}
            <line x1={M.left} x2={W - M.right} y1={baseline} y2={baseline} stroke="#bbbbbb" strokeWidth="1" />
            {xTicks.map((t) => (
              <g key={t.t}>
                <line x1={x(t.t)} x2={x(t.t)} y1={baseline} y2={baseline + 5} stroke="#bbbbbb" strokeWidth="1" />
                <text x={x(t.t)} y={H - 10} textAnchor="middle" fontSize="11.5" fill="#666" fontFamily="Oswald Variable, sans-serif" letterSpacing="0.04em">
                  {t.label}
                </text>
              </g>
            ))}

            {/* reference lines, label haloed and anchored left, clear of the line */}
            {drawn.map((r) => (
              <g key={r.label}>
                <line x1={M.left} x2={W - M.right} y1={y(r.value)} y2={y(r.value)} stroke="#cf2e2e" strokeWidth="1" strokeDasharray="6 4" />
                <text
                  x={M.left + 6}
                  y={y(r.value) - 6}
                  fontSize="10.5"
                  fill="#cf2e2e"
                  fontFamily="Oswald Variable, sans-serif"
                  letterSpacing="0.05em"
                  paintOrder="stroke"
                  stroke="#ffffff"
                  strokeWidth="3.5"
                >
                  {r.label}
                </text>
              </g>
            ))}

            {/* per-entry-point lines (few entry points) */}
            {lines.map((l) =>
              l.segments
                .filter((seg) => seg.length > 1)
                .map((seg, si) => (
                  <polyline
                    key={`${l.analyte}-${l.ep}-${si}`}
                    points={seg.map((p) => `${x(Date.parse(p.date))},${y(p.value == null ? 0 : p.value)}`).join(' ')}
                    fill="none"
                    stroke={l.color}
                    strokeWidth={EP_WIDTH[l.epIndex % EP_WIDTH.length]}
                    strokeDasharray={EP_DASH[l.epIndex % EP_DASH.length]}
                    strokeLinejoin="round"
                    opacity={EP_OPACITY[l.epIndex % EP_OPACITY.length]}
                  />
                ))
            )}

            {/* max-per-date lines (many entry points) */}
            {maxLines.map((l) =>
              l.segments
                .filter((seg) => seg.length > 1)
                .map((seg, si) => (
                  <polyline
                    key={`max-${l.analyte}-${si}`}
                    points={seg.map((p) => `${x(Date.parse(p.date))},${y(p.value)}`).join(' ')}
                    fill="none"
                    stroke={l.color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    opacity="0.9"
                  />
                ))
            )}

            {/* markers + generous invisible hover targets */}
            {!manyEps &&
              lines.map((l) =>
                l.pts.map((p) => {
                  const px = x(Date.parse(p.date))
                  const py = y(p.value == null ? 0 : p.value)
                  const active = tip && tip.point === p && tip.label === l.label
                  return (
                    <g key={`${l.analyte}-${l.ep}-${p.date}-${p.seq_no ?? ''}`}>
                      {active && (
                        <circle cx={px} cy={py} r={7} fill="none" stroke={l.color} strokeWidth="1.2" opacity="0.45" />
                      )}
                      <MarkerShape
                        shape={EP_SHAPE[l.epIndex % EP_SHAPE.length]}
                        x={px}
                        y={py}
                        color={l.color}
                        open={p.value == null}
                        opacity={EP_OPACITY[l.epIndex % EP_OPACITY.length]}
                      />
                      <circle
                        cx={px}
                        cy={py}
                        r={12}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={() => setTip({ x: px, y: py, point: p, color: l.color, label: l.label })}
                      />
                    </g>
                  )
                })
              )}
            {manyEps &&
              dots.map(({ p, series: s }) => {
                const px = x(Date.parse(p.date))
                const py = y(p.value == null ? 0 : p.value)
                const active = tip && tip.point === p
                return (
                  <g key={`dot-${s.analyte}-${p.date}-${p.seq_no ?? ''}`}>
                    {active && (
                      <circle cx={px} cy={py} r={6.5} fill="none" stroke={s.color} strokeWidth="1.2" opacity="0.45" />
                    )}
                    <MarkerShape small x={px} y={py} color={s.color} open={p.value == null} opacity={0.75} />
                    <circle
                      cx={px}
                      cy={py}
                      r={9}
                      fill="transparent"
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setTip({ x: px, y: py, point: p, color: s.color, label: s.label })}
                    />
                  </g>
                )
              })}
          </svg>

          {tip && <Tooltip tip={tip} unit={unit} />}
        </div>
      </div>

      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.analyte}>
            <svg width="26" height="9" aria-hidden="true">
              <line x1="1" y1="4.5" x2="25" y2="4.5" stroke={s.color} strokeWidth="2.5" />
            </svg>
            {s.label}
          </span>
        ))}
        {!manyEps &&
          eps.length > 1 &&
          eps.map((ep, i) => (
            <span key={ep}>
              <svg width="26" height="9" aria-hidden="true">
                <line
                  x1="1"
                  y1="4.5"
                  x2="25"
                  y2="4.5"
                  stroke="#666"
                  strokeWidth={EP_WIDTH[i % EP_WIDTH.length]}
                  strokeDasharray={EP_DASH[i % EP_DASH.length]}
                  opacity={EP_OPACITY[i % EP_OPACITY.length]}
                />
              </svg>
              entry point {ep ?? 'unspecified'}
            </span>
          ))}
        {manyEps && (
          <span>
            {eps.length} entry points — every sample shown as a dot; the line follows the highest
            result per sampling date
          </span>
        )}
        <span>open marker = non-detect (&lt;LOD, plotted on the zero line)</span>
      </div>

      {offScale.map((r) => (
        <p key={r.label} className="note">
          Off this chart&rsquo;s scale: <strong>{r.label}</strong> — well above every result shown.
        </p>
      ))}
    </div>
  )
}
