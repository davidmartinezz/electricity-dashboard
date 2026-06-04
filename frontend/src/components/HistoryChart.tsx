import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { AFRRHistoryPoint, IDA1HistoryPoint } from '../types'

interface AFRRProps {
  market: 'afrr'
  data: AFRRHistoryPoint[]
  unit: string
}

interface IDA1Props {
  market: 'ida1'
  data: IDA1HistoryPoint[]
  unit: string
}

type Props = AFRRProps | IDA1Props

function dayLabel(d: string) {
  const dt = new Date(d + 'T12:00:00')
  return dt.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

const yFmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))

export default function HistoryChart({ data, market, unit }: Props) {
  if (data.length < 2) return null

  const chartData = data.map(d => ({ ...d, label: dayLabel(d.date) }))

  // Compute rolling average (3-day window)
  const withAvg = chartData.map((d, i) => {
    const window = chartData.slice(Math.max(0, i - 2), i + 1)
    const key = market === 'afrr' ? 'mae_up' : 'mae'
    const vals = window.map(w => (w as any)[key]).filter((v: any) => v != null)
    return {
      ...d,
      avg: vals.length ? Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : null,
    }
  })

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
      <p className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wide">
        Histórico MAE — Error medio por día
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={withAvg} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#475569', fontSize: 10 }}
            tickLine={false}
            interval={Math.max(0, Math.floor(data.length / 7) - 1)}
          />
          <YAxis
            tick={{ fill: '#475569', fontSize: 10 }}
            width={48}
            tickFormatter={yFmt}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v: number, name: string) => [
              `${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${unit}`,
              name,
            ]}
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '10px',
              color: '#f1f5f9',
              fontSize: '12px',
            }}
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '11px', color: '#64748b', paddingTop: '6px' }}
            formatter={v => <span style={{ color: '#94a3b8' }}>{v}</span>}
          />
          {market === 'afrr' ? (
            <>
              <Bar dataKey="mae_up" name="MAE UP" fill="#38bdf8" opacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={16} />
              <Bar dataKey="mae_down" name="MAE DOWN" fill="#a78bfa" opacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={16} />
            </>
          ) : (
            <Bar dataKey="mae" name="MAE" fill="#38bdf8" opacity={0.7} radius={[2, 2, 0, 0]} maxBarSize={16} />
          )}
          <Line
            type="monotone"
            dataKey="avg"
            name="Media 3d"
            stroke="#fb923c"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
