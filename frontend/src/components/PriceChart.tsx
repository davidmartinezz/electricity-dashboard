import {
  ComposedChart,
  Area,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

export interface ChartPoint {
  label: string
  pred: number
  real?: number | null
}

interface Props {
  data: ChartPoint[]
  unit: string
  hasReal: boolean
  predColor?: string
  realColor?: string
  title?: string
  yFormatter?: (v: number) => string
  xTickFormatter?: (v: string) => string
}

const defaultYFmt = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(1)

export default function PriceChart({
  data,
  unit,
  hasReal,
  predColor = '#38bdf8',
  realColor = '#fb923c',
  title,
  yFormatter = defaultYFmt,
  xTickFormatter,
}: Props) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs shadow-2xl min-w-[160px]">
        <p className="text-slate-300 font-semibold mb-2">{label}</p>
        {payload.map((entry: any) => (
          <div key={entry.name} className="flex justify-between gap-3 py-0.5">
            <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="font-mono text-slate-200">
              {entry.value != null
                ? entry.value.toLocaleString('es-ES', { maximumFractionDigits: 1 })
                : '—'}{' '}
              <span className="text-slate-500">{unit}</span>
            </span>
          </div>
        ))}
        {payload.length === 2 && payload[0].value != null && payload[1].value != null && (
          <div className="border-t border-slate-700 mt-2 pt-2 flex justify-between">
            <span className="text-slate-500">Error</span>
            <span className="font-mono text-amber-400">
              {Math.abs(payload[0].value - payload[1].value).toLocaleString('es-ES', { maximumFractionDigits: 1 })} {unit}
            </span>
          </div>
        )}
      </div>
    )
  }

  const defaultTickFormatter = (v: string) => {
    const [h, m] = v.split(':')
    if (m !== '00') return ''
    const hour = parseInt(h)
    return hour % 4 === 0 ? `${hour}h` : ''
  }
  const tickFormatter = xTickFormatter ?? defaultTickFormatter

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4">
      {title && (
        <p className="text-xs font-medium text-slate-400 mb-3 uppercase tracking-wide">{title}</p>
      )}
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <defs>
            <linearGradient id={`grad-pred-${predColor.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={predColor} stopOpacity={0.3} />
              <stop offset="95%" stopColor={predColor} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#475569', fontSize: 11 }}
            tickFormatter={tickFormatter}
            interval={0}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#475569', fontSize: 11 }}
            tickFormatter={yFormatter}
            width={55}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ color: '#64748b', fontSize: '12px', paddingTop: '8px' }}
            formatter={(v) => <span style={{ color: '#94a3b8' }}>{v}</span>}
          />
          <Area
            type="monotone"
            dataKey="pred"
            name="Predicción"
            fill={`url(#grad-pred-${predColor.replace('#', '')})`}
            stroke={predColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: predColor }}
          />
          {hasReal && (
            <Line
              type="monotone"
              dataKey="real"
              name="Real"
              stroke={realColor}
              strokeWidth={2.5}
              dot={false}
              connectNulls={false}
              activeDot={{ r: 4, fill: realColor }}
            />
          )}
          {/* Zero reference line — visible when prices go negative */}
          <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" strokeWidth={1} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
