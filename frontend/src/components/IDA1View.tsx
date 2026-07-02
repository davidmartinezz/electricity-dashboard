import { useEffect, useState } from 'react'
import { fetchIDA1Range, fetchHistoryIDA1 } from '../api'
import type { IDA1RangeData, IDA1RangePoint, IDA1HistoryPoint } from '../types'
import StatCard from './StatCard'
import PriceChart from './PriceChart'
import ErrorChart from './ErrorChart'
import HistoryChart from './HistoryChart'

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

const yFmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 })

const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
const round1 = (v: number) => Math.round(v * 10) / 10
const rmseFn = (errs: number[]) => Math.sqrt(errs.reduce((a, b) => a + b * b, 0) / errs.length)
function medianFn(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

interface PeakMetrics {
  mae: number
  rmse: number
  recall: number
  threshold: number
  n: number
  total: number
}

function computePeakMetrics(series: IDA1RangePoint[], pct = 0.15): PeakMetrics | null {
  const withReal = series.filter(p => p.real !== null && p.pred !== null)
  if (withReal.length < 10) return null

  const n = Math.ceil(withReal.length * pct)

  // Top n periods by real price → actual peaks
  const byReal = [...withReal].sort((a, b) => b.real! - a.real!).slice(0, n)
  const peakTs = new Set(byReal.map(p => p.ts))
  const threshold = byReal[byReal.length - 1].real!

  // Peak MAE and RMSE
  const peakErrors = byReal.map(p => Math.abs(p.pred! - p.real!))
  const mae = round1(avg(peakErrors))
  const rmse = round1(rmseFn(peakErrors))

  // Recall: fraction of actual peak periods the model also ranked top n by prediction
  const byPred = [...withReal].sort((a, b) => b.pred! - a.pred!).slice(0, n)
  const predPeakTs = new Set(byPred.map(p => p.ts))
  const hits = [...peakTs].filter(ts => predPeakTs.has(ts)).length
  const recall = hits / n

  return { mae, rmse, recall, threshold, n, total: withReal.length }
}

export default function IDA1View() {
  const { today, tomorrow } = getTodayTomorrow()
  const [fromDate, setFromDate] = useState(today)
  const [toDate, setToDate] = useState(tomorrow)
  const [rangeData, setRangeData] = useState<IDA1RangeData | null>(null)
  const [history, setHistory] = useState<IDA1HistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetchHistoryIDA1().then(setHistory)
  }, [])

  useEffect(() => {
    if (!fromDate || !toDate || fromDate > toDate) return
    setLoading(true)
    setErr(null)
    fetchIDA1Range(fromDate, toDate)
      .then(setRangeData)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [fromDate, toDate])

  const series = rangeData?.series ?? []
  const isMultiDay = fromDate !== toDate

  const errors = series.filter(p => p.error !== null).map(p => p.error!)
  const metrics = errors.length ? {
    mae: round1(avg(errors)),
    rmse: round1(rmseFn(errors)),
    max_error: round1(Math.max(...errors)),
  } : null

  const peakMetrics = rangeData?.has_real ? computePeakMetrics(series) : null

  const preds = series.filter(p => p.pred !== null).map(p => p.pred!)
  const stats = preds.length ? {
    mean: avg(preds),
    median: medianFn(preds),
    min: Math.min(...preds),
    max: Math.max(...preds),
  } : null

  const chartData = series.map(p => ({
    label: fmtTs(p.ts, isMultiDay),
    pred: p.pred ?? 0,
    real: p.real,
  }))

  const errorData = series.map(p => ({
    label: fmtTs(p.ts, isMultiDay),
    error: p.error,
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
      return [ts, p.pred ?? '', p.real ?? ''].join(',')
    })
    const csv = ['ts,forecast,real', ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ida1_${fromDate}_${toDate}.csv`
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
          Hoy + Mañana
        </button>

        {series.length > 0 && (
          <button
            onClick={downloadCSV}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 bg-slate-800 text-xs transition-colors flex items-center gap-1"
          >
            ↓ Descargar CSV
          </button>
        )}

        {rangeData && (
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-600">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${rangeData.has_real ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {rangeData.has_real ? 'Datos reales disponibles' : 'Predicción (reales pendientes)'}
          </div>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
          <div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          Cargando datos…
        </div>
      )}

      {/* Error */}
      {err && !loading && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-4 text-red-400 text-sm">{err}</div>
      )}

      {/* No data */}
      {!loading && !err && rangeData && series.length === 0 && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-8 text-center">
          <p className="text-slate-400 text-sm">Sin datos de IDA1 para el rango seleccionado</p>
          <p className="text-slate-600 text-xs mt-1">Las predicciones se generan a las 13:00 (todos los días)</p>
        </div>
      )}

      {!loading && series.length > 0 && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="MAE"
              value={metrics ? metrics.mae.toLocaleString('es-ES') : null}
              unit="€/MWh"
              color={!metrics ? 'slate' : metrics.mae < 30 ? 'green' : metrics.mae < 80 ? 'sky' : metrics.mae < 150 ? 'orange' : 'red'}
              secondary={metrics ? `RMSE: ${metrics.rmse.toLocaleString('es-ES')}` : undefined}
            />
            <StatCard
              label="Error Máximo"
              value={metrics ? metrics.max_error.toLocaleString('es-ES') : null}
              unit="€/MWh"
              color="orange"
            />
            <StatCard
              label="Media Predicción"
              value={stats ? stats.mean.toLocaleString('es-ES', { maximumFractionDigits: 1 }) : null}
              unit="€/MWh"
              color="slate"
              secondary={stats ? `Mediana: ${stats.median.toLocaleString('es-ES', { maximumFractionDigits: 1 })}` : undefined}
            />
            <StatCard
              label="Rango Predicción"
              value={stats ? `${stats.min.toFixed(1)} – ${stats.max.toFixed(1)}` : null}
              unit="€/MWh"
              color="slate"
            />
          </div>

          {/* Peak metrics */}
          {peakMetrics && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium px-0.5">
                Picos · top 15% ({peakMetrics.n} QH de {peakMetrics.total})
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard
                  label="MAE en Picos"
                  value={peakMetrics.mae.toLocaleString('es-ES')}
                  unit="€/MWh"
                  color={peakMetrics.mae < 50 ? 'green' : peakMetrics.mae < 120 ? 'sky' : peakMetrics.mae < 200 ? 'orange' : 'red'}
                  secondary={`RMSE: ${peakMetrics.rmse.toLocaleString('es-ES')}`}
                />
                <StatCard
                  label="Acierto Picos"
                  value={`${Math.round(peakMetrics.recall * 100)}%`}
                  color={peakMetrics.recall >= 0.65 ? 'green' : peakMetrics.recall >= 0.45 ? 'sky' : peakMetrics.recall >= 0.25 ? 'orange' : 'red'}
                  secondary={`${Math.round(peakMetrics.recall * peakMetrics.n)}/${peakMetrics.n} períodos acertados`}
                />
                <StatCard
                  label="Umbral Pico"
                  value={peakMetrics.threshold.toLocaleString('es-ES', { maximumFractionDigits: 1 })}
                  unit="€/MWh"
                  color="violet"
                  secondary="p85 del precio real"
                />
              </div>
            </div>
          )}

          {/* Main chart */}
          <PriceChart
            data={chartData}
            unit="€/MWh"
            hasReal={rangeData?.has_real ?? false}
            title={`Predicción vs Real · IDA1 · ${fromDate} – ${toDate}`}
            yFormatter={yFmt}
            xTickFormatter={xTickFmt}
          />

          {/* Error chart */}
          {rangeData?.has_real && (
            <ErrorChart
              data={errorData}
              unit="€/MWh"
              title="Error absoluto por período · IDA1"
              yFormatter={yFmt}
              xTickFormatter={xTickFmt}
            />
          )}

          {/* History */}
          {history.length >= 2 && (
            <HistoryChart data={history} market="ida1" unit="€/MWh" />
          )}
        </>
      )}
    </div>
  )
}
