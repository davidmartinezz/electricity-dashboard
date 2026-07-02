import { useEffect, useState } from 'react'
import { fetchAFRRRange, fetchHistoryAFRR } from '../api'
import type { AFRRRangeData, AFRRHistoryPoint } from '../types'
import StatCard from './StatCard'
import PriceChart from './PriceChart'
import ErrorChart from './ErrorChart'
import HistoryChart from './HistoryChart'

type Dir = 'up' | 'down'

function getTodayTomorrow() {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  return { today, tomorrow }
}

function fmtTs(ts: string, multiDay: boolean): string {
  const d = new Date(ts)
  if (multiDay) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Madrid',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d)
    const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00'
    return `${get('day')}/${get('month')} ${get('hour')}:${get('minute')}`
  }
  return d.toLocaleTimeString('es-ES', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
  })
}

function toMadridISO(ts: string): string {
  const d = new Date(ts)
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(d).replace(' ', 'T')
}

const yFmt = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : v.toFixed(1)

const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
const round1 = (v: number) => Math.round(v * 10) / 10
const rmseFn = (errs: number[]) => Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length)
function medianFn(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export default function AFRRView() {
  const { today, tomorrow } = getTodayTomorrow()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(tomorrow)
  const [rangeData, setRangeData] = useState<AFRRRangeData | null>(null)
  const [history, setHistory] = useState<AFRRHistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dir, setDir] = useState<Dir>('up')

  useEffect(() => {
    fetchHistoryAFRR().then(setHistory)
  }, [])

  useEffect(() => {
    if (!fromDate || !toDate || fromDate > toDate) return
    setLoading(true)
    setErr(null)
    fetchAFRRRange(fromDate, toDate)
      .then(setRangeData)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [fromDate, toDate])

  const series = rangeData?.series ?? []
  const isMultiDay = fromDate !== toDate

  const upErrors = series.filter(p => p.up_error !== null).map(p => p.up_error!)
  const downErrors = series.filter(p => p.down_error !== null).map(p => p.down_error!)
  const metrics_up = upErrors.length ? {
    mae: round1(avg(upErrors)),
    rmse: round1(rmseFn(upErrors)),
    max_error: round1(Math.max(...upErrors)),
  } : null
  const metrics_down = downErrors.length ? {
    mae: round1(avg(downErrors)),
    rmse: round1(rmseFn(downErrors)),
    max_error: round1(Math.max(...downErrors)),
  } : null
  const metrics = dir === 'up' ? metrics_up : metrics_down

  const upPreds = series.filter(p => p.up_pred !== null).map(p => p.up_pred!)
  const downPreds = series.filter(p => p.down_pred !== null).map(p => p.down_pred!)
  const statsUp = upPreds.length ? { mean: avg(upPreds), median: medianFn(upPreds), min: Math.min(...upPreds), max: Math.max(...upPreds) } : null
  const statsDown = downPreds.length ? { mean: avg(downPreds), median: medianFn(downPreds), min: Math.min(...downPreds), max: Math.max(...downPreds) } : null
  const currentStats = dir === 'up' ? statsUp : statsDown
  const predColor = dir === 'up' ? '#38bdf8' : '#a78bfa'

  const chartData = series.map(p => ({
    label: fmtTs(p.ts, isMultiDay),
    pred: (dir === 'up' ? p.up_pred : p.down_pred) ?? 0,
    real: dir === 'up' ? p.up_real : p.down_real,
  }))

  const errorData = series.map(p => ({
    label: fmtTs(p.ts, isMultiDay),
    error: dir === 'up' ? p.up_error : p.down_error,
  }))

  const xTickFmt = isMultiDay
    ? (label: string) => {
        const [, time] = label.split(' ')
        return time === '00:00' ? label.split(' ')[0] : ''
      }
    : undefined

  function downloadCSV() {
    const rows = series.map(p => {
      const ts = toMadridISO(p.ts)
      const forecast = dir === 'up' ? p.up_pred : p.down_pred
      const real = dir === 'up' ? p.up_real : p.down_real
      return [ts, forecast ?? '', real ?? ''].join(',')
    })
    const csv = ['ts,forecast,real', ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `afrr_${dir}_${fromDate}_${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={fromDate}
            max={toDate}
            onChange={e => setFromDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          />
          <span className="text-slate-600 text-sm">—</span>
          <input
            type="date"
            value={toDate}
            min={fromDate}
            onChange={e => setToDate(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          />
        </div>

        <button
          onClick={() => { const { today, tomorrow } = getTodayTomorrow(); setFromDate(today); setToDate(tomorrow) }}
          className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 bg-slate-800 text-xs transition-colors"
        >
          Today + Tomorrow
        </button>

        {/* Direction toggle */}
        <div className="flex rounded-lg border border-slate-700 overflow-hidden text-sm">
          <button
            onClick={() => setDir('up')}
            className={`px-4 py-2 font-medium transition-colors ${
              dir === 'up' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            ↑ UP
          </button>
          <button
            onClick={() => setDir('down')}
            className={`px-4 py-2 font-medium transition-colors border-l border-slate-700 ${
              dir === 'down' ? 'bg-violet-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            ↓ DOWN
          </button>
        </div>

        {series.length > 0 && (
          <button
            onClick={downloadCSV}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 bg-slate-800 text-xs transition-colors flex items-center gap-1"
          >
            ↓ Download CSV
          </button>
        )}

        {rangeData && (
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-600">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rangeData.has_real ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {rangeData.has_real ? 'Actual data available' : 'Forecast (actuals pending)'}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          Loading data…
        </div>
      )}

      {/* Error */}
      {err && !loading && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-4 text-red-400 text-sm">{err}</div>
      )}

      {/* No data */}
      {!loading && !err && rangeData && series.length === 0 && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-8 text-center">
          <p className="text-slate-400 text-sm">No aFRR data for the selected range</p>
          <p className="text-slate-600 text-xs mt-1">Forecasts are generated at 10:00 (every day)</p>
        </div>
      )}

      {!loading && series.length > 0 && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={`MAE ${dir.toUpperCase()}`}
              value={metrics ? metrics.mae.toLocaleString('es-ES') : null}
              unit="€/MW"
              color={!metrics ? 'slate' : metrics.mae < 800 ? 'green' : metrics.mae < 2000 ? 'sky' : metrics.mae < 4000 ? 'orange' : 'red'}
              secondary={metrics ? `RMSE: ${metrics.rmse.toLocaleString('es-ES')}` : undefined}
            />
            <StatCard
              label="Max Error"
              value={metrics ? metrics.max_error.toLocaleString('es-ES') : null}
              unit="€/MW"
              color="orange"
            />
            <StatCard
              label="Forecast Mean"
              value={currentStats ? currentStats.mean.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : null}
              unit="€/MW"
              color="slate"
              secondary={currentStats ? `Median: ${currentStats.median.toLocaleString('es-ES', { maximumFractionDigits: 1 })}` : undefined}
            />
            <StatCard
              label="Forecast Range"
              value={currentStats ? `${currentStats.min.toLocaleString('es-ES', { maximumFractionDigits: 1 })} – ${currentStats.max.toLocaleString('es-ES', { maximumFractionDigits: 1 })}` : null}
              unit="€/MW"
              color="slate"
            />
          </div>

          {/* Main chart */}
          <PriceChart
            data={chartData}
            unit="€/MW"
            hasReal={rangeData?.has_real ?? false}
            predColor={predColor}
            title={`Forecast vs Actual · aFRR ${dir.toUpperCase()} · ${fromDate} – ${toDate}`}
            yFormatter={yFmt}
            xTickFormatter={xTickFmt}
          />

          {/* Error chart */}
          {rangeData?.has_real && (
            <ErrorChart
              data={errorData}
              unit="€/MW"
              title={`Absolute Error · aFRR ${dir.toUpperCase()}`}
              yFormatter={yFmt}
              xTickFormatter={xTickFmt}
            />
          )}

          {/* Both directions comparison if real data */}
          {rangeData?.has_real && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard label="MAE UP" value={metrics_up ? metrics_up.mae.toLocaleString('es-ES') : null} unit="€/MW" color="sky" secondary="Upward regulation reserve" />
              <StatCard label="MAE DOWN" value={metrics_down ? metrics_down.mae.toLocaleString('es-ES') : null} unit="€/MW" color="violet" secondary="Downward regulation reserve" />
            </div>
          )}

          {/* History */}
          {history.length >= 2 && (
            <HistoryChart data={history} market="afrr" unit="€/MW" />
          )}
        </>
      )}
    </div>
  )
}
