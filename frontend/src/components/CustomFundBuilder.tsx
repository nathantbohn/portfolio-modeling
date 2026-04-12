import { useState, useRef, useEffect, useCallback } from 'react'
import type { CustomFundStock } from '../types'

const API_URL = import.meta.env.VITE_API_URL as string | undefined
const MAX_STOCKS = 25

interface SearchResult {
  ticker: string
  name: string
  sector: string
}

interface CustomFundBuilderProps {
  onClose: () => void
  onCreate: (fund: {
    name: string
    stocks: CustomFundStock[]
    weightMode: 'equal' | 'manual'
  }) => void
}

export default function CustomFundBuilder({ onClose, onCreate }: CustomFundBuilderProps) {
  const [fundName, setFundName] = useState('')
  const [stocks, setStocks] = useState<CustomFundStock[]>([])
  const [weightMode, setWeightMode] = useState<'equal' | 'manual'>('equal')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchRef = useRef<HTMLDivElement>(null)

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (!API_URL || q.length < 1) {
      setResults([])
      return
    }
    fetch(`${API_URL}/search?q=${encodeURIComponent(q)}`)
      .then((res) => res.ok ? res.json() as Promise<SearchResult[]> : [])
      .then(setResults)
      .catch(() => setResults([]))
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 1) { setResults([]); return }
    debounceRef.current = setTimeout(() => doSearch(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query, doSearch])

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const addStock = (r: SearchResult) => {
    if (stocks.length >= MAX_STOCKS) return
    if (stocks.some((s) => s.ticker === r.ticker)) return
    const equalWeight = 100 / (stocks.length + 1)
    setStocks((prev) => [
      ...prev.map((s) => ({ ...s, weight: equalWeight })),
      { ticker: r.ticker, name: r.name, weight: equalWeight },
    ])
    setQuery('')
    setResults([])
    setShowResults(false)
  }

  const removeStock = (ticker: string) => {
    setStocks((prev) => {
      const next = prev.filter((s) => s.ticker !== ticker)
      if (next.length === 0) return next
      const w = 100 / next.length
      return next.map((s) => ({ ...s, weight: w }))
    })
  }

  const setStockWeight = (ticker: string, weight: number) => {
    setStocks((prev) =>
      prev.map((s) => (s.ticker === ticker ? { ...s, weight } : s)),
    )
  }

  const weightSum = stocks.reduce((s, st) => s + st.weight, 0)
  const canCreate = fundName.trim().length > 0 && stocks.length > 0 &&
    (weightMode === 'equal' || Math.abs(weightSum - 100) < 0.5)

  const handleCreate = () => {
    if (!canCreate) return
    const finalStocks = weightMode === 'equal'
      ? stocks.map((s) => ({ ...s, weight: 100 / stocks.length }))
      : stocks
    onCreate({ name: fundName.trim(), stocks: finalStocks, weightMode })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface-1 border border-border rounded-lg w-[420px] max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-warm-50">Build Custom Fund</h2>
          <button onClick={onClose} className="text-warm-300 hover:text-warm-50 transition-colors" type="button">
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Fund name */}
          <div>
            <label className="text-[10px] text-warm-200 uppercase tracking-widest block mb-1">Fund Name</label>
            <input
              type="text"
              value={fundName}
              onChange={(e) => setFundName(e.target.value)}
              placeholder="e.g. My Tech Fund"
              className="w-full bg-surface-0 border border-border rounded-md px-2.5 py-1.5 text-xs text-warm-50 placeholder:text-warm-400 focus:outline-none focus:border-warm-300 transition-colors"
            />
          </div>

          {/* Stock search */}
          <div ref={searchRef} className="relative">
            <label className="text-[10px] text-warm-200 uppercase tracking-widest block mb-1">
              Add Stocks ({stocks.length}/{MAX_STOCKS})
            </label>
            {!API_URL ? (
              <p className="text-[11px] text-warm-300">Set VITE_API_URL to enable stock search</p>
            ) : (
              <>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setShowResults(true) }}
                  onFocus={() => results.length > 0 && setShowResults(true)}
                  placeholder="Search by ticker or company name..."
                  disabled={stocks.length >= MAX_STOCKS}
                  className="w-full bg-surface-0 border border-border rounded-md px-2.5 py-1.5 text-xs text-warm-50 placeholder:text-warm-400 focus:outline-none focus:border-warm-300 transition-colors disabled:opacity-40"
                />
                {showResults && results.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface-1 border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {results
                      .filter((r) => !stocks.some((s) => s.ticker === r.ticker))
                      .map((r) => (
                        <button
                          key={r.ticker}
                          onClick={() => addStock(r)}
                          className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-surface-2 transition-colors text-left"
                          type="button"
                        >
                          <span className="text-xs font-semibold text-warm-50 w-12 flex-shrink-0">{r.ticker}</span>
                          <span className="text-[11px] text-warm-200 truncate flex-1">{r.name}</span>
                          <span className="text-[10px] text-warm-400 flex-shrink-0">{r.sector}</span>
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Weight mode */}
          {stocks.length > 0 && (
            <div>
              <label className="text-[10px] text-warm-200 uppercase tracking-widest block mb-1">Weighting</label>
              <div className="flex gap-1">
                {(['equal', 'manual'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setWeightMode(mode)
                      if (mode === 'equal') {
                        const w = 100 / stocks.length
                        setStocks((prev) => prev.map((s) => ({ ...s, weight: w })))
                      }
                    }}
                    className={[
                      'px-2.5 py-1 rounded text-[11px] font-mono transition-colors border',
                      weightMode === mode
                        ? 'bg-warm-50 text-surface-0 border-warm-50'
                        : 'text-warm-200 border-border hover:text-warm-50 hover:border-warm-200',
                    ].join(' ')}
                    type="button"
                  >
                    {mode === 'equal' ? 'Equal Weight' : 'Manual'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Constituent list */}
          {stocks.length > 0 && (
            <div>
              <label className="text-[10px] text-warm-200 uppercase tracking-widest block mb-1">
                Constituents
                {weightMode === 'manual' && (
                  <span className={Math.abs(weightSum - 100) < 0.5 ? ' text-warm-300' : ' text-[#C0392B]'}>
                    {' '}({weightSum.toFixed(1)}%)
                  </span>
                )}
              </label>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {stocks.map((stock) => (
                  <div key={stock.ticker} className="flex items-center gap-2 bg-surface-0 rounded px-2 py-1.5">
                    <span className="text-[11px] font-semibold text-warm-50 w-10 flex-shrink-0">{stock.ticker}</span>
                    <span className="text-[10px] text-warm-200 truncate flex-1">{stock.name}</span>
                    {weightMode === 'manual' ? (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <input
                          type="number"
                          min={0} max={100} step={0.1}
                          value={stock.weight.toFixed(1)}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            if (!isNaN(v)) setStockWeight(stock.ticker, v)
                          }}
                          className="w-12 bg-surface-1 border border-border rounded px-1 py-0.5 text-[10px] font-mono text-warm-50 text-right tabular-nums focus:outline-none focus:border-warm-300"
                        />
                        <span className="text-warm-300 text-[10px]">%</span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-mono text-warm-300 flex-shrink-0">
                        {(100 / stocks.length).toFixed(1)}%
                      </span>
                    )}
                    <button
                      onClick={() => removeStock(stock.ticker)}
                      className="text-warm-400 hover:text-warm-50 transition-colors flex-shrink-0"
                      type="button"
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] text-warm-200 hover:text-warm-50 border border-border rounded-md transition-colors"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="px-3 py-1.5 text-[11px] font-medium bg-accent text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
            type="button"
          >
            Create Fund
          </button>
        </div>
      </div>
    </div>
  )
}
