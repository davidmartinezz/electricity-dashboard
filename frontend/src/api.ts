import type { AFRRData, IDA1Data, DateList, AFRRHistoryPoint, IDA1HistoryPoint } from './types'

const BASE = ''

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${path}`)
  return r.json()
}

export const fetchDates = () => get<DateList>('/api/dates')
export const fetchAFRR = (d: string) => get<AFRRData>(`/api/afrr/${d}`)
export const fetchIDA1 = (d: string) => get<IDA1Data>(`/api/ida1/${d}`)
export const fetchHistoryAFRR = () => get<AFRRHistoryPoint[]>('/api/history/afrr')
export const fetchHistoryIDA1 = () => get<IDA1HistoryPoint[]>('/api/history/ida1')
