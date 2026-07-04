export const KEY_ANALYTES = ['PFOA', 'PFOS', 'PFHXS', 'PFNA', 'HFPO-DA', 'PFBS']

export const ANALYTE_LABELS = {
  PFOA: 'PFOA',
  PFOS: 'PFOS',
  PFHXS: 'PFHxS',
  PFNA: 'PFNA',
  'HFPO-DA': 'HFPO-DA (GenX)',
  PFBS: 'PFBS',
}

// Federal MCLs for these three (and the Hazard Index) were proposed for
// rescission May 18, 2026 — must be labeled as such wherever shown.
export const RESCISSION_ANALYTES = new Set(['PFHXS', 'PFNA', 'HFPO-DA'])

// EPA PWSIDs — the canonical system key; 622 of 730 systems are
// SDWIS-only and carry no DNR id.
export const MUNICIPAL_TRACKER_IDS = [
  'WI7370102', // Wausau Waterworks
  'WI7370163', // Weston Municipal Utilities
  'WI7370660', // Rib Mountain Water Utility
  'WI7370161', // Rothschild Waterworks
  'WI7370159', // Mosinee Waterworks
]

const TYPE_CODE_LABELS = {
  CWS: 'Community',
  TNCWS: 'Transient noncommunity',
  NTNCWS: 'Nontransient noncommunity',
}

export const typeLabel = (s) => s.type || TYPE_CODE_LABELS[s.type_code] || s.type_code || '—'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

export function fmtMonthYear(iso) {
  if (!iso) return '—'
  const [y, m] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}

export const fmtNum = (n) => (n == null ? '—' : n.toLocaleString('en-US'))

// Editorial policy: non-detects are null, never 0. Render honestly.
export function fmtResult(entry) {
  if (!entry) return { text: 'not tested', cls: 'nd' }
  if (entry.value == null && entry.qualifier && entry.qualifier !== 'Non-detect') {
    // e.g. DNR 'Unexplained' rows: no value in the record, not a non-detect
    return { text: 'n/a', cls: 'nd', title: `No value in DNR's record (qualifier: ${entry.qualifier})` }
  }
  if (entry.value == null) return { text: '<LOD', cls: 'nd', title: 'Non-detect: below the limit of detection' }
  if (entry.qualifier === 'Between LOD and LOQ') {
    return {
      text: `${entry.value} trace`,
      cls: 'trace',
      title: 'Estimated: detected between the limit of detection and the limit of quantitation',
    }
  }
  return { text: String(entry.value), cls: 'det' }
}

// The transform emits combined = 0 when both PFOA and PFOS are non-detects;
// policy says non-detects are never 0, so render <LOD in that case.
export function fmtCombined(pfas) {
  const pfoa = pfas.latest?.PFOA?.value
  const pfos = pfas.latest?.PFOS?.value
  if (pfoa == null && pfos == null) return '<LOD'
  return String(pfas.latest_combined_pfoa_pfos)
}

export function titleCase(s) {
  if (!s) return s
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bOf\b/g, 'of')
    .replace(/\bAnd\b/g, 'and')
    .replace(/\bLlc\b/g, 'LLC')
    .replace(/\bMhp\b/g, 'MHP')
    .replace(/\bDnr\b/g, 'DNR')
    .replace(/^Wi\b/, 'WI')
}

export const SOURCE_LABELS = {
  GW: 'Groundwater',
  SW: 'Surface water',
  GU: 'Groundwater under surface-water influence',
  GWP: 'Purchased groundwater',
  SWP: 'Purchased surface water',
}

export const VIOLATION_CATEGORY_LABELS = {
  MCL: 'Maximum contaminant level',
  MR: 'Monitoring & reporting',
  TT: 'Treatment technique',
  MRDL: 'Disinfectant residual level',
  Other: 'Other',
}

// SDWIS rule_code → federal rule name (codes present in the 6-county pull)
export const RULE_NAMES = {
  110: 'Total Coliform Rule',
  111: 'Revised Total Coliform Rule',
  140: 'Ground Water Rule',
  210: 'Stage 1 Disinfectants & Byproducts',
  220: 'Stage 2 Disinfectants & Byproducts',
  310: 'Volatile Organic Chemicals',
  320: 'Synthetic Organic Chemicals',
  331: 'Nitrates',
  332: 'Arsenic',
  333: 'Inorganic Chemicals',
  340: 'Radionuclides',
  350: 'Lead & Copper Rule',
  351: 'Lead & Copper Rule Revisions',
  410: 'Public Notification',
  420: 'Consumer Confidence Report',
  500: 'Other / unregulated contaminant',
}

export const ruleName = (code) => RULE_NAMES[code] || `Rule ${code}`

// ECHO returns some rule names in ALL CAPS; normalize for prose display.
export const calmCase = (s) => (s === s.toUpperCase() ? titleCase(s) : s)

// Display casing for analytes outside the key panel
const OTHER_ANALYTE_LABELS = {
  PFHXA: 'PFHxA',
  PFHPA: 'PFHpA',
  PFHPS: 'PFHpS',
  PFUNA: 'PFUnA',
  PFTrDA: 'PFTrDA',
  NETFOSAA: 'NEtFOSAA',
  NMEFOSAA: 'NMeFOSAA',
  NETFOSA: 'NEtFOSA',
  NMEFOSA: 'NMeFOSA',
}

export const otherAnalyteLabel = (a) => OTHER_ANALYTE_LABELS[a] || a

export const CHEM_LABELS = {
  nitrate: 'Nitrate (as N)',
  arsenic: 'Arsenic',
  lead: 'Lead',
  copper: 'Copper',
}

export const UNIT_LABELS = { 'MG/L': 'mg/L', 'UG/L': 'µg/L', 'NG/L': 'ng/L' }
export const unitLabel = (u) => UNIT_LABELS[u] || (u ? u.toLowerCase() : '')
