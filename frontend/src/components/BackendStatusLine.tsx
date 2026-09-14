import type { RequestPhase } from '../utils/dataAccess'

export const SLOW_SERVER_MESSAGE = 'Waking the data server — first request can take up to a minute.'

interface BackendStatusLineProps {
  phase: RequestPhase
  loadingLabel: string
  onRetry: () => void
}

/**
 * One-line status for a backend request, shown on the element that triggered
 * it: spinner + label while loading, a cold-start note once the request is
 * slow, and an inline error with Retry on failure. Renders nothing when ready.
 */
export default function BackendStatusLine({ phase, loadingLabel, onRetry }: BackendStatusLineProps) {
  if (phase.status === 'ready') return null

  if (phase.status === 'error') {
    return (
      <div className="flex items-center justify-between gap-2" role="alert">
        <span className="text-[10px] text-accent">{phase.error.message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="flex-shrink-0 min-h-[44px] sm:min-h-0 text-[10px] text-warm-200 hover:text-warm-50 border border-border rounded px-2 py-0.5 hover:bg-surface-2 transition-colors"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5" role="status" aria-live="polite">
      <div className="w-2.5 h-2.5 rounded-full border-2 border-warm-300 border-t-transparent animate-spin flex-shrink-0" />
      <span className="text-[10px] text-warm-300">
        {phase.status === 'slow' ? SLOW_SERVER_MESSAGE : loadingLabel}
      </span>
    </div>
  )
}
