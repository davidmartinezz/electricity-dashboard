interface Props {
  dates: string[]        // available dates (YYYY-MM-DD)
  value: string
  onChange: (d: string) => void
  noDataMessage?: string
}

export default function DatePicker({ dates, value, onChange, noDataMessage }: Props) {
  const set = new Set(dates)
  const min = dates.length ? [...dates].sort()[0] : ''
  // Max: tomorrow (predictions can be for tomorrow)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const max = [...dates, tomorrow].sort().at(-1) ?? ''

  const hasData = set.has(value)

  return (
    <div className="flex flex-col gap-1">
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value)}
        className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
          focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500
          cursor-pointer [color-scheme:dark]"
      />
      {value && !hasData && (
        <span className="text-xs text-amber-400 px-1">
          Sin predicción para este día
        </span>
      )}
    </div>
  )
}
