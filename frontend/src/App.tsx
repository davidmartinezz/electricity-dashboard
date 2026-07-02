import { useState } from 'react'
import AFRRView from './components/AFRRView'
import IDA1View from './components/IDA1View'

type Tab = 'afrr' | 'ida1'

export default function App() {
  const [tab, setTab] = useState<Tab>('afrr')

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/20">
            <svg className="w-5 h-5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-white leading-tight">
              Spanish Electricity Prices
            </h1>
            <p className="text-xs text-slate-500">Forecast vs Actual · Peninsular Market</p>
          </div>
          <div className="ml-auto text-xs text-slate-600 hidden sm:block">
            REE / ESIOS · Daily automatic update
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="border-b border-slate-800 bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <nav className="flex">
            {(['afrr', 'ida1'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`relative px-5 py-3.5 text-sm font-medium transition-colors ${
                  tab === t
                    ? 'text-sky-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t === 'afrr' ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-base">⚖️</span>
                    aFRR — Regulation Reserve
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span className="text-base">📈</span>
                    IDA1 — Intraday Market
                  </span>
                )}
                {tab === t && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-sky-400 rounded-full" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {tab === 'afrr' ? <AFRRView /> : <IDA1View />}
      </main>
    </div>
  )
}
