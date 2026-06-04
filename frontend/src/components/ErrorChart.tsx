import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

interface Point { label: string; error: number | null }

interface Props {
  data: Point[]
  unit: string
  title?: string
  yFormatter?: (v: number) => string
}

function errorColor(ratio: number): string {
  // green → yellow → red
  if (ratio < 0.5) {
    const t = ratio * 2
    const r = Math.round(74 + (250 - 74) * t)
    const g = Math.round(222 + (204 - 222) * t)
    const b = Math.round(128 + (21 - 128) * t)
    return `rgb(${r},${g},${b})`
  }
  const t = (ratio - 0.5) * 2
  const r = Math.round(250 + (248 - 250) * t)
  const g = Math.round(204 + (113 - 204) * t)
  const b = Math.round(21 + (113 - 21) * t)
  return `rgb(${r},${g},${b})`
}

const defaultYFmt = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v))

export default function ErrorChart({ data, unit, title, yFormatter = defaultYFmt }: Props) {
  const valid = data.filter(d => d.error != null)
  if (valid.length === 0) return null

  const maxErr = Math.max(...valid.map(d => d.error!))

  const tickFormatter = (v: string) => {
    const [h, m] = v.split(':')
    if (m !== '00') return ''
    return parseInt(h) % 4 === 0 ? `${parseInt(h)}h` : ''
  }

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
      {title && (
        <p className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wide">{title}</p>
      )}
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={valid} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#475569', fontSize: 10 }}
            tickFormatter={tickFormatter}
            interval={0}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#475569', fontSize: 10 }}
            width={48}
            tickFormatter={yFormatter}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v: number) => [
              `${v.toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${unit}`,
              'Error abs.',
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
          <Bar dataKey="error" radius={[2, 2, 0, 0]} maxBarSize={12}>
            {valid.map((entry, i) => (
              <Cell key={i} fill={errorColor(entry.error! / maxErr)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-end gap-4 mt-2 text-xs text-slate-600">
        <span className="flex items-center gap-1">
          <span className="w-3 h-1.5 rounded bg-emerald-400 inline-block" /> Bajo
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-1.5 rounded bg-yellow-400 inline-block" /> Medio
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-1.5 rounded bg-red-400 inline-block" /> Alto
        </span>
      </div>
    </div>
  )
}
