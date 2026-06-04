import { useState } from 'react'

export default function AIReport({ content }: { content: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border border-slate-700/60 rounded-xl overflow-hidden bg-slate-800/30">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-400
          hover:text-slate-200 transition-colors group"
      >
        <span className="flex items-center gap-2 font-medium">
          <span className="text-base">🤖</span>
          Informe IA — Análisis del mercado
        </span>
        <span className={`transition-transform text-slate-600 ${open ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-slate-700/60">
          <pre className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed font-sans mt-3
            max-h-[500px] overflow-y-auto">
            {content}
          </pre>
        </div>
      )}
    </div>
  )
}
