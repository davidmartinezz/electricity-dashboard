type Color = 'sky' | 'orange' | 'red' | 'green' | 'violet' | 'slate'

interface Props {
  label: string
  value: string | number | null | undefined
  unit?: string
  color?: Color
  trend?: { value: number; label: string }
  secondary?: string
}

const colors: Record<Color, string> = {
  sky: 'text-sky-400',
  orange: 'text-orange-400',
  red: 'text-red-400',
  green: 'text-emerald-400',
  violet: 'text-violet-400',
  slate: 'text-slate-200',
}

export default function StatCard({ label, value, unit, color = 'sky', trend, secondary }: Props) {
  const hasValue = value !== null && value !== undefined

  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</span>
      <div className="flex items-end gap-1.5 mt-1">
        <span className={`text-2xl font-bold tabular-nums ${colors[color]}`}>
          {hasValue ? value : '—'}
        </span>
        {hasValue && unit && (
          <span className="text-xs text-slate-500 mb-0.5">{unit}</span>
        )}
      </div>
      {trend && (
        <div className={`text-xs ${trend.value <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend.value > 0 ? '+' : ''}{trend.value} vs {trend.label}
        </div>
      )}
      {secondary && <div className="text-xs text-slate-600 mt-0.5">{secondary}</div>}
    </div>
  )
}
