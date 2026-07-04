const DATA_BASE = import.meta.env.BASE_URL + 'data/processed/'

async function getJson(name) {
  const res = await fetch(DATA_BASE + name)
  if (!res.ok) throw new Error(`Failed to load ${name}: HTTP ${res.status}`)
  return res.json()
}

export const loadSummary = () => getJson('summary.json')
export const loadSystems = () => getJson('systems.json')

// pfas_results.json is ~2.7 MB — loaded once, on demand, when a trend
// chart is first requested.
let resultsPromise = null
export function loadPfasResults() {
  if (!resultsPromise) resultsPromise = getJson('pfas_results.json')
  return resultsPromise
}
