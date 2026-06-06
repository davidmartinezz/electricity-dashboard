import { useEffect, useState } from 'react'
import { fetchDates, fetchAFRR, fetchHistoryAFRR } from '../api'
import type { AFRRData, AFRRHistoryPoint } from '../types'
import DatePicker from './DatePicker'
import StatCard from './StatCard'
import PriceChart from './PriceChart'
import ErrorChart from './ErrorChart'
import HistoryChart from './HistoryChart'
import AIReport from './AIReport'

type Dir = 'up' | 'down'

function fmtTs(ts: string) {
  return new Date(ts).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  })
}

const yFmt = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v))

export default function AFRRView() {
  const [dates, setDates] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [data, setData] = useState<AFRRData | null>(null)
  const [history, setHistory] = useState<AFRRHistoryPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dir, setDir] = useState<Dir>('up')

  useEffect(() => {
    fetchDates().then(d => {
      setDates(d.afrr)
      if (d.afrr.length) {
        const today = new Date().toISOString().slice(0, 10)
        const sorted = [...d.afrr].sort()
        // Prefer today, then most recent available date
        setSelected(sorted.includes(today) ? today : sorted.at(-1)!)
      }
    })
    fetchHistoryAFRR().then(setHistory)
  }, [])

  useEffect(() => {
    if (!selected) return
    setLoading(true)
    setErr(null)
    fetchAFRR(selected)
      .then(setData)
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [selected])

  const metrics = dir === 'up' ? data?.metrics_up : data?.metrics_down
  const stats = dir === 'up' ? data?.stats_pred?.up : data?.stats_pred?.down
  const predColor = dir === 'up' ? '#38bdf8' : '#a78bfa'

  const chartData = (data?.series ?? []).map(p => ({
    label: fmtTs(p.ts),
    pred: dir === 'up' ? p.up_pred : p.down_pred,
    real: dir === 'up' ? p.up_real : p.down_real,
  }))

  const errorData = (data?.series ?? []).map(p => ({
    label: fmtTs(p.ts),
    error: dir === 'up' ? p.up_error : p.down_error,
  }))

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {dates.length > 0 && (
          <DatePicker dates={dates} value={selected} onChange={setSelected} />
        )}
        {/* Quick-access buttons */}
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

        {/* Direction toggle */}
        <div className="flex rounded-lg border border-slate-700 overflow-hidden text-sm">
          <button
            onClick={() => setDir('up')}
            className={`px-4 py-2 font-medium transition-colors ${
              dir === 'up'
                ? 'bg-sky-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            ↑ UP
          </button>
          <button
            onClick={() => setDir('down')}
            className={`px-4 py-2 font-medium transition-colors border-l border-slate-700 ${
              dir === 'down'
                ? 'bg-violet-700 text-white'
                : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            ↓ DOWN
          </button>
        </div>

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
          <p className="text-slate-400 text-sm">Sin predicción aFRR para <span className="text-slate-200 font-medium">{selected}</span></p>
          <p className="text-slate-600 text-xs mt-1">Las predicciones se generan a las 10:00 (L-V)</p>
        </div>
      )}

      {/* Error */}
      {err && !loading && new Set(dates).has(selected) && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-4 text-red-400 text-sm">
          {err}
        </div>
      )}

      {/* No dates */}
      {!loading && dates.length === 0 && (
        <div className="text-slate-500 text-center py-16">
          No hay archivos de predicción aFRR en el directorio de salida.
        </div>
      )}

      {!loading && data && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label={`MAE ${dir.toUpperCase()}`}
              value={metrics ? metrics.mae.toLocaleString('es-ES') : null}
              unit="€/MW"
              color={
                !metrics
                  ? 'slate'
                  : metrics.mae < 800
                  ? 'green'
                  : metrics.mae < 2000
                  ? 'sky'
                  : metrics.mae < 4000
                  ? 'orange'
                  : 'red'
              }
              secondary={metrics ? `RMSE: ${metrics.rmse.toLocaleString('es-ES')}` : undefined}
            />
            <StatCard
              label="Error Máximo"
              value={metrics ? metrics.max_error.toLocaleString('es-ES') : null}
              unit="€/MW"
              color="orange"
            />
            <StatCard
              label="Media Predicción"
              value={stats ? stats.mean.toLocaleString('es-ES', { maximumFractionDigits: 0 }) : null}
              unit="€/MW"
              color="slate"
              secondary={stats ? `Mediana: ${stats.median.toLocaleString('es-ES', { maximumFractionDigits: 0 })}` : undefined}
            />
            <StatCard
              label="Rango Predicción"
              value={
                stats
                  ? `${stats.min.toLocaleString('es-ES', { maximumFractionDigits: 0 })} – ${stats.max.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`
                  : null
              }
              unit="€/MW"
              color="slate"
            />
          </div>

          {/* Main chart */}
          <PriceChart
            data={chartData}
            unit="€/MW"
            hasReal={data.has_real}
            predColor={predColor}
            title={`Predicción vs Real · aFRR ${dir.toUpperCase()} · ${selected}`}
            yFormatter={yFmt}
          />

          {/* Error chart */}
          {data.has_real && (
            <ErrorChart
              data={errorData}
              unit="€/MW"
              title={`Error absoluto por período · aFRR ${dir.toUpperCase()}`}
              yFormatter={yFmt}
            />
          )}

          {/* Both directions comparison if real data available */}
          {data.has_real && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                label="MAE UP"
                value={data.metrics_up ? data.metrics_up.mae.toLocaleString('es-ES') : null}
                unit="€/MW"
                color="sky"
                secondary="Reserva regulación ascendente"
              />
              <StatCard
                label="MAE DOWN"
                value={data.metrics_down ? data.metrics_down.mae.toLocaleString('es-ES') : null}
                unit="€/MW"
                color="violet"
                secondary="Reserva regulación descendente"
              />
            </div>
          )}

          {/* History */}
          {history.length >= 2 && (
            <HistoryChart data={history} market="afrr" unit="€/MW" />
          )}

          {/* AI Report */}
          {data.ai_report && <AIReport content={data.ai_report} />}
        </>
      )}
    </div>
  )
}
