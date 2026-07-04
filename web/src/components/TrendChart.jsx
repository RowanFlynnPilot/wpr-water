import { useMemo } from 'react'
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

function niceStep(range) {
  const raw = range / 6
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (raw <= m * pow) return m * pow
  }
  return 10 * pow
}

function Marker({ shape, x, y, color, open, opacity, title }) {
  const fill = open ? '#fff' : color
  const common = { fill, stroke: color, strokeWidth: 1.3, opacity }
  let el
  if (shape === 'square') el = <rect x={x - 2.8} y={y - 2.8} width={5.6} height={5.6} {...common} />
  else if (shape === 'triangle')
    el = <polygon points={`${x},${y - 3.6} ${x - 3.4},${y + 2.7} ${x + 3.4},${y + 2.7}`} {...common} />
  else if (shape === 'diamond')
    el = <polygon points={`${x},${y - 3.8} ${x + 3.8},${y} ${x},${y + 3.8} ${x - 3.8},${y}`} {...common} />
  else el = <circle cx={x} cy={y} r={3} {...common} />
  return (
    <g>
      <title>{title}</title>
      {el}
    </g>
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
    const yTop = Math.max(dataMax, ...drawn.map((r) => r.value), 0.5) * 1.15
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

    // one line per (analyte, entry point)
    const eps = [...new Set(points.map((p) => p.source_id))].sort((a, b) => a - b)
    const lines = []
    for (const s of series) {
      for (const ep of eps) {
        const pts = points
          .filter((p) => p.analyte === s.analyte && p.source_id === ep)
          .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
        if (pts.length) lines.push({ ...s, ep, epIndex: eps.indexOf(ep), pts })
      }
    }
    return { x, y, yMax, yTicks, xTicks, lines, eps, drawn, offScale }
  }, [points, series, refLines])

  const { x, y, yTicks, xTicks, lines, eps, drawn, offScale } = model
  const baseline = y(0)

  return (
    <div>
      <div className="chart-wrap">
        <svg className="chart-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="PFAS trend chart">
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

          {lines.map((l) => (
            <polyline
              key={`${l.analyte}-${l.ep}`}
              points={l.pts.map((p) => `${x(Date.parse(p.date))},${y(p.value == null ? 0 : p.value)}`).join(' ')}
              fill="none"
              stroke={l.color}
              strokeWidth={EP_WIDTH[l.epIndex % EP_WIDTH.length]}
              strokeDasharray={EP_DASH[l.epIndex % EP_DASH.length]}
              strokeLinejoin="round"
              opacity={EP_OPACITY[l.epIndex % EP_OPACITY.length]}
            />
          ))}
          {lines.map((l) =>
            l.pts.map((p) => (
              <Marker
                key={`${l.analyte}-${l.ep}-${p.date}-${p.seq_no ?? ''}`}
                shape={EP_SHAPE[l.epIndex % EP_SHAPE.length]}
                x={x(Date.parse(p.date))}
                y={y(p.value == null ? 0 : p.value)}
                color={l.color}
                open={p.value == null}
                opacity={EP_OPACITY[l.epIndex % EP_OPACITY.length]}
                title={
                  `${l.label} — ` +
                  (p.value == null
                    ? `non-detect (<LOD)`
                    : `${p.value} ${unit}${p.qualifier === 'Between LOD and LOQ' ? ' (trace, estimated)' : ''}`) +
                  ` — ${fmtDate(p.date)} — entry point ${p.source_id} — ${p.sample_type} sample`
                }
              />
            ))
          )}
        </svg>
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
        {eps.length > 1 &&
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
              entry point {ep}
            </span>
          ))}
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
