const DATA_BASE = import.meta.env.BASE_URL + 'data/processed/'

async function getJson(name) {
  const res = await fetch(DATA_BASE + name)
  if (!res.ok) throw new Error(`Failed to load ${name}: HTTP ${res.status}`)
  return res.json()
}

export const loadSummary = () => getJson('summary.json')
export const loadSystems = () => getJson('systems.json')

// The per-sample files are ~3 MB each — loaded once, on demand, when a
// trend chart first needs them.
let resultsPromise = null
export function loadPfasResults() {
  if (!resultsPromise) resultsPromise = getJson('pfas_results.json')
  return resultsPromise
}

let chemPromise = null
export function loadChemResults() {
  if (!chemPromise) chemPromise = getJson('chem_results.json')
  return chemPromise
}
