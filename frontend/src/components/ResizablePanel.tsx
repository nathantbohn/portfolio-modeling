import { useRef, useState, useCallback, useEffect, type ReactNode } from 'react'

const STORAGE_KEY_PREFIX = 'chart-height:'
const MIN_HEIGHT = 150
const MAX_HEIGHT = 600

interface ResizablePanelProps {
  id: string
  defaultHeight: number
  children: ReactNode
}

function readStored(id: string, fallback: number): number {
  try {
    const v = localStorage.getItem(STORAGE_KEY_PREFIX + id)
    if (v != null) {
      const n = parseInt(v, 10)
      if (!isNaN(n) && n >= MIN_HEIGHT && n <= MAX_HEIGHT) return n
    }
  } catch { /* localStorage unavailable */ }
  return fallback
}

export default function ResizablePanel({ id, defaultHeight, children }: ResizablePanelProps) {
  const [height, setHeight] = useState(() => readStored(id, defaultHeight))
  const dragging = useRef(false)
  const startY = useRef(0)
  const startH = useRef(0)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startH.current = height
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [height])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const delta = e.clientY - startY.current
    const next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startH.current + delta))
    setHeight(next)
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
    const delta = e.clientY - startY.current
    const final = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, startH.current + delta))
    try { localStorage.setItem(STORAGE_KEY_PREFIX + id, String(final)) } catch { /* */ }
  }, [id])

  // Prevent text selection globally while dragging
  useEffect(() => {
    const onDown = () => {
      if (dragging.current) document.body.style.userSelect = 'none'
    }
    const onUp = () => { document.body.style.userSelect = '' }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
      document.body.style.userSelect = ''
    }
  }, [])

  return (
    <div className="flex-shrink-0 flex flex-col" style={{ height }}>
      <div className="flex-1 min-h-0 rounded-lg border border-border overflow-hidden">
        {children}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="flex-shrink-0 flex items-center justify-center h-3 cursor-row-resize group"
      >
        <div className="w-8 h-[3px] rounded-full bg-border group-hover:bg-warm-200 transition-colors" />
      </div>
    </div>
  )
}
