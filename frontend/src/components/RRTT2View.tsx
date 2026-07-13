import { useEffect, useState } from 'react'
import { fetchRRTT2Range, exportCSVUrl } from '../api'
import type { AFRRRangeData } from '../types'
import StatCard from './StatCard'
import PriceChart from './PriceChart'
import ErrorChart from './ErrorChart'

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

const yFmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 })

const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
const round1 = (v: number) => Math.round(v * 10) / 10
const rmseFn = (errs: number[]) => Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length)

export default function RRTT2View() {
  const { today, tomorrow } = getTodayTomorrow()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(tomorrow)
  const [rangeData, setRangeData] = useState<AFRRRangeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dir, setDir] = useState<Dir>('down')

  useEffect(() => {
    if (!fromDate || !toDate || fromDate > toDate) return
    setLoading(true)
    setErr(null)
    fetchRRTT2Range(fromDate, toDate)
      .then(setRangeData)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [fromDate, toDate])

  const series = rangeData?.series ?? []
  const isMultiDay = fromDate !== toDate

  const dirErrors = series
    .map(p => (dir === 'up' ? p.up_error : p.down_error))
    .filter((e): e is number => e !== null)
  const metrics = dirErrors.length ? {
    mae: round1(avg(dirErrors)),
    rmse: round1(rmseFn(dirErrors)),
    max_error: round1(Math.max(...dirErrors)),
  } : null

  const dirPreds = series
    .map(p => (dir === 'up' ? p.up_pred : p.down_pred))
    .filter((v): v is number => v !== null)
  const stats = dirPreds.length ? {
    mean: avg(dirPreds),
    min: Math.min(...dirPreds),
    max: Math.max(...dirPreds),
  } : null

  // Pay-as-bid sparse market: real === null means "no redispatch that hour".
  // Count active hours so the UP tab makes sense on quiet days.
  const dirReals = series.map(p => (dir === 'up' ? p.up_real : p.down_real))
  const activeHours = dirReals.filter(v => v !== null).length
  const hasAnyReal = rangeData?.has_real ?? false

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
    : (label: string) => {
        const h = parseInt(label.split(':')[0])
        return h % 4 === 0 ? `${h}h` : ''
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
          <a
            href={exportCSVUrl('rrtt2', fromDate, toDate)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 bg-slate-800 text-xs transition-colors flex items-center gap-1"
          >
            ↓ Download CSV
          </a>
        )}

        {rangeData && (
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-600">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hasAnyReal ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {hasAnyReal ? 'Actual data available' : 'Forecast (actuals pending)'}
          </div>
        )}
      </div>

      {/* Pay-as-bid note */}
      <p className="text-xs text-slate-600">
        Pay-as-bid hourly market · resolved at ~18:00 CET the day before delivery.
        Hours without an actual price had no redispatch in that direction — the UP
        market only activates on ~1 of every 5 days.
      </p>

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
          <p className="text-slate-400 text-sm">No RRTT2 data for the selected range</p>
          <p className="text-slate-600 text-xs mt-1">Forecasts are generated at 15:30 (every day)</p>
        </div>
      )}

      {!loading && series.length > 0 && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={`MAE ${dir.toUpperCase()}`}
              value={metrics ? metrics.mae.toLocaleString('es-ES') : null}
              unit="€/MWh"
              color={!metrics ? 'slate' : metrics.mae < 10 ? 'green' : metrics.mae < 25 ? 'sky' : metrics.mae < 60 ? 'orange' : 'red'}
              secondary={metrics ? `RMSE: ${metrics.rmse.toLocaleString('es-ES')}` : undefined}
            />
            <StatCard
              label="Max Error"
              value={metrics ? metrics.max_error.toLocaleString('es-ES') : null}
              unit="€/MWh"
              color="orange"
            />
            <StatCard
              label="Forecast Mean"
              value={stats ? stats.mean.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : null}
              unit="€/MWh"
              color="slate"
              secondary={stats ? `Range: ${stats.min.toFixed(1)} – ${stats.max.toFixed(1)}` : undefined}
            />
            <StatCard
              label={`Active Hours ${dir.toUpperCase()}`}
              value={hasAnyReal ? activeHours : null}
              unit={`of ${series.length}`}
              color={dir === 'up' && activeHours === 0 ? 'slate' : 'violet'}
              secondary={dir === 'up' && hasAnyReal && activeHours === 0 ? 'No UP redispatch' : undefined}
            />
          </div>

          {/* Main chart */}
          <PriceChart
            data={chartData}
            unit="€/MWh"
            hasReal={hasAnyReal}
            predColor={predColor}
            title={`Forecast vs Actual · RRTT2 ${dir.toUpperCase()} · ${fromDate} – ${toDate}`}
            yFormatter={yFmt}
            xTickFormatter={xTickFmt}
          />

          {/* Error chart */}
          {hasAnyReal && dirErrors.length > 0 && (
            <ErrorChart
              data={errorData}
              unit="€/MWh"
              title={`Absolute Error · RRTT2 ${dir.toUpperCase()}`}
              yFormatter={yFmt}
              xTickFormatter={xTickFmt}
            />
          )}
        </>
      )}
    </div>
  )
}
