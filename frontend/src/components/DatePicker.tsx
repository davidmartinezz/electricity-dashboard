interface Props {
  dates: string[]
  value: string
  onChange: (d: string) => void
}

function label(d: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  const dt = new Date(d + 'T12:00:00')
  const fmt = dt.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

  if (d === today) return `Hoy — ${fmt}`
  if (d === yesterday) return `Ayer — ${fmt}`
  if (d === tomorrow) return `Mañana — ${fmt}`
  return fmt
}

export default function DatePicker({ dates, value, onChange }: Props) {
  const sorted = [...dates].sort((a, b) => b.localeCompare(a))
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100
        focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500
        cursor-pointer min-w-[200px]"
    >
      {sorted.map(d => (
        <option key={d} value={d}>{label(d)}</option>
      ))}
    </select>
  )
}
