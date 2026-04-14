import { Dialog } from '../../components/ui/Dialog'

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-200/50 bg-bg-200/25 px-3 py-2.5">
      <div className="text-[length:var(--fs-xs)] text-text-400">{label}</div>
      <div className="mt-1 text-[length:var(--fs-base)] font-mono text-text-200">{value}</div>
    </div>
  )
}

interface KtContextDetailsDialogProps {
  isOpen: boolean
  onClose: () => void
  sessionId: string
  agentName: string
  model: string
  contextLimit: number
  promptTokens: number
  completionTokens: number
  cachedTokens: number
}

export function KtContextDetailsDialog({
  isOpen,
  onClose,
  sessionId,
  agentName,
  model,
  contextLimit,
  promptTokens,
  completionTokens,
  cachedTokens,
}: KtContextDetailsDialogProps) {
  const total = promptTokens + completionTokens
  const ctxPercent = contextLimit > 0 ? Math.round((promptTokens / contextLimit) * 100) : 0

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="KT Context" width="min(92vw, 760px)">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat label="Session" value={sessionId || '—'} />
          <Stat label="Agent" value={agentName || '—'} />
          <Stat label="Model" value={model || '—'} />
          <Stat label="Context limit" value={String(contextLimit || 0)} />
          <Stat label="Prompt tokens" value={String(promptTokens)} />
          <Stat label="Completion tokens" value={String(completionTokens)} />
          <Stat label="Cached tokens" value={String(cachedTokens)} />
          <Stat label="Context usage" value={`${ctxPercent}%`} />
        </div>

        <div className="rounded-xl border border-border-200/50 bg-bg-200/20 p-4">
          <div className="mb-2 flex items-center justify-between text-[length:var(--fs-sm)]">
            <span className="font-medium text-text-200">Current turn pressure</span>
            <span className="font-mono text-text-400">{ctxPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-bg-300">
            <div
              className={`h-full origin-left ${ctxPercent >= 90 ? 'bg-danger-100' : ctxPercent >= 70 ? 'bg-warning-100' : 'bg-accent-main-100'}`}
              style={{ transform: `scaleX(${Math.min(ctxPercent, 100) / 100})` }}
            />
          </div>
          <div className="mt-2 text-[length:var(--fs-xs)] text-text-400">Total visible tokens: {total}. Cached tokens are counted separately for backend accounting.</div>
        </div>
      </div>
    </Dialog>
  )
}
