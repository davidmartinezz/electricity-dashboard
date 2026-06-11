import { useEffect, useState } from 'react'
import { fetchDates, fetchIDA1, fetchHistoryIDA1 } from '../api'
import type { IDA1Data, IDA1HistoryPoint } from '../types'
import DatePicker from './DatePicker'
import StatCard from './StatCard'
import PriceChart from './PriceChart'
import ErrorChart from './ErrorChart'
import HistoryChart from './HistoryChart'
import AIReport from './AIReport'

const fmtDate = (d: string) => d.replaceAll('-', '/')

function fmtTs(ts: string) {
  return new Date(ts).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  })
}

// IDA1 values are in €/MWh — can be negative (solar surplus)
const yFmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 0 })

export default function IDA1View() {
  const [dates, setDates] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [data, setData] = useState<IDA1Data | null>(null)
  const [history, setHistory] = useState<IDA1HistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetchDates().then(d => {
      setDates(d.ida1)
      if (d.ida1.length) {
        const today = new Date().toISOString().slice(0, 10)
        const sorted = [...d.ida1].sort()
        setSelected(sorted.includes(today) ? today : sorted.at(-1)!)
      }
    })
    fetchHistoryIDA1().then(setHistory)
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    setErr(null)
    fetchIDA1(selected)
      .then(setData)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [selected])

  const chartData = (data?.series ?? []).map(p => ({
    label: fmtTs(p.ts),
    pred: p.pred,
    real: p.real,
  }))

  const errorData = (data?.series ?? []).map(p => ({
    label: fmtTs(p.ts),
    error: p.error,
  }))

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {dates.length > 0 && (
          <DatePicker dates={dates} value={selected} onChange={setSelected} />
        )}
        {(() => {
          const today = new Date().toISOString().slice(0, 10)
          const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
          const set = new Set(dates)
          return (
            <div className="flex gap-1.5 text-xs">
              {set.has(today) && (
                <button onClick={() => setSelected(today)}
                  className={`px-3 py-1.5 rounded-lg border transition-colors ${selected === today ? 'bg-sky-600 border-sky-500 text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200 bg-slate-800'}`}>
                  Hoy
                </button>
              )}
              {set.has(tomorrow) && (
                <button onClick={() => setSelected(tomorrow)}
                  className={`px-3 py-1.5 rounded-lg border transition-colors ${selected === tomorrow ? 'bg-sky-600 border-sky-500 text-white' : 'border-slate-700 text-slate-400 hover:text-slate-200 bg-slate-800'}`}>
                  Mañana
                </button>
              )}
            </div>
          )
        })()}

        {data && (
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-600">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                data.has_real ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
            />
            {data.has_real ? 'Datos reales disponibles' : 'Predicción (reales pendientes)'}
            <span className="hidden sm:inline text-slate-700">·</span>
            <span className="hidden sm:inline">
              Generado {new Date(data.generated_at).toLocaleString('es-ES', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                timeZone: 'Europe/Madrid',
              })}
            </span>
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

      {/* No data for selected date */}
      {!loading && selected && !new Set(dates).has(selected) && (
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-8 text-center">
          <p className="text-slate-400 text-sm">Sin predicción IDA1 para <span className="text-slate-200 font-medium">{fmtDate(selected)}</span></p>
          <p className="text-slate-600 text-xs mt-1">Las predicciones se generan a las 13:00 (L-V)</p>
        </div>
      )}

      {err && !loading && new Set(dates).has(selected) && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-4 text-red-400 text-sm">
          {err}
        </div>
      )}

      {!loading && dates.length === 0 && (
        <div className="text-slate-500 text-center py-16">
          No hay archivos de predicción IDA1 en el directorio de salida.
        </div>
      )}

      {!loading && data && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="MAE"
              value={data.metrics ? data.metrics.mae.toLocaleString('es-ES') : null}
              unit="€/MWh"
              color={
                !data.metrics
                  ? 'slate'
                  : data.metrics.mae < 30
                  ? 'green'
                  : data.metrics.mae < 80
                  ? 'sky'
                  : data.metrics.mae < 150
                  ? 'orange'
                  : 'red'
              }
              secondary={data.metrics ? `RMSE: ${data.metrics.rmse.toLocaleString('es-ES')}` : undefined}
            />
            <StatCard
              label="Error Máximo"
              value={data.metrics ? data.metrics.max_error.toLocaleString('es-ES') : null}
              unit="€/MWh"
              color="orange"
            />
            <StatCard
              label="Media Predicción"
              value={
                data.stats_pred
                  ? data.stats_pred.mean.toLocaleString('es-ES', { maximumFractionDigits: 0 })
                  : null
              }
              unit="€/MWh"
              color="slate"
              secondary={
                data.stats_pred
                  ? `Mediana: ${data.stats_pred.median.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`
                  : undefined
              }
            />
            <StatCard
              label="Rango Predicción"
              value={
                data.stats_pred
                  ? `${data.stats_pred.min.toFixed(0)} – ${data.stats_pred.max.toFixed(0)}`
                  : null
              }
              unit="€/MWh"
              color="slate"
            />
          </div>

          {/* Hourly heatmap */}
          {data.hourly_pred && (
            <HourlyHeatmap hourly={data.hourly_pred} realSeries={data.series} />
          )}

          {/* Main chart */}
          <PriceChart
            data={chartData}
            unit="€/MWh"
            hasReal={data.has_real}
            title={`Predicción vs Real · IDA1 · ${fmtDate(selected)}`}
            yFormatter={yFmt}
          />

          {/* Error chart */}
          {data.has_real && (
            <ErrorChart
              data={errorData}
              unit="€/MWh"
              title="Error absoluto por período · IDA1"
              yFormatter={yFmt}
            />
          )}

          {/* History */}
          {history.length >= 2 && (
            <HistoryChart data={history} market="ida1" unit="€/MWh" />
          )}

          {/* AI Report */}
          {data.ai_report && <AIReport content={data.ai_report} />}
        </>
      )}
    </div>
  )
}

/* ── Hourly heatmap ──────────────────────────────────────────────────────── */

interface HeatmapProps {
  hourly: Record<string, number>
  realSeries: IDA1Data['series']
}

function HourlyHeatmap({ hourly, realSeries }: HeatmapProps) {
  const entries = Object.entries(hourly).sort(([a], [b]) => a.localeCompare(b))
  if (entries.length === 0) return null

  const prices = entries.map(([, v]) => v)
  const min = Math.min(...prices)
  const max = Math.max(...prices)

  // Get real hourly prices from 15-min series
  const realHourly: Record<string, number> = {}
  realSeries.forEach(p => {
    if (p.real != null) {
      const h = new Date(p.ts).toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid',
      }).replace(':15', ':00').replace(':30', ':00').replace(':45', ':00')
      realHourly[h] = p.real
    }
  })

  function heatColor(v: number): string {
    const t = (v - min) / (max - min || 1)
    // blue (cold/cheap) → green → yellow → red (hot/expensive)
    if (t < 0.25) {
      const s = t * 4
      return `rgb(${Math.round(56 + (74 - 56) * s)},${Math.round(189 + (222 - 189) * s)},${Math.round(248 + (128 - 248) * s)})`
    } else if (t < 0.5) {
      const s = (t - 0.25) * 4
      return `rgb(${Math.round(74 + (250 - 74) * s)},${Math.round(222 + (204 - 222) * s)},${Math.round(128 + (21 - 128) * s)})`
    } else if (t < 0.75) {
      const s = (t - 0.5) * 4
      return `rgb(${Math.round(250 + (251 - 250) * s)},${Math.round(204 + (146 - 204) * s)},${Math.round(21 + (60 - 21) * s)})`
    }
    const s = (t - 0.75) * 4
    return `rgb(${Math.round(251 + (239 - 251) * s)},${Math.round(146 + (68 - 146) * s)},${Math.round(60 + (68 - 60) * s)})`
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
      <p className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wide">
        Predicción por hora
      </p>
      <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-24 gap-1">
        {entries.map(([hour, val]) => {
          const realVal = realHourly[hour]
          const hasReal = realVal != null
          const err = hasReal ? Math.abs(val - realVal) : null
          return (
            <div
              key={hour}
              title={`${hour}\nPred: ${Math.round(val)} €/MWh${hasReal ? `\nReal: ${Math.round(realVal)} €/MWh\nError: ${Math.round(err!)} €/MWh` : ''}`}
              className="relative rounded-md p-1.5 flex flex-col items-center cursor-default group"
              style={{ background: heatColor(val) + '33', borderColor: heatColor(val) + '66', borderWidth: 1 }}
            >
              <span className="text-[9px] text-slate-500 font-mono">{hour.replace(':00', 'h')}</span>
              <span className="text-[10px] font-bold mt-0.5" style={{ color: heatColor(val) }}>
                {Math.round(val)}
              </span>
              {hasReal && (
                <span className="text-[9px] text-orange-400 mt-0.5">{Math.round(realVal!)}</span>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-slate-600">
        <span>Precio pred en €/MWh (azul=bajo, rojo=alto)</span>
        {Object.keys(realHourly).length > 0 && (
          <span className="text-orange-400">naranja = real</span>
        )}
      </div>
    </div>
  )
}
