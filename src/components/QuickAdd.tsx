import { useState } from 'react'
import {
  parseNote,
  executeActions,
  actionIsExecutable,
  type QuickAddAction,
} from '@/lib/quickAdd'

function describeAction(action: QuickAddAction): { title: string; detail: string; warning?: string } {
  if (action.type === 'create_candidate') {
    const bits = [action.currentTitle, action.yearsPqe != null ? `${action.yearsPqe} PQE` : null]
      .filter(Boolean)
      .join(' · ')
    return {
      title: `New candidate: ${action.firstName} ${action.lastName}`,
      detail: [bits, action.email].filter(Boolean).join(' — ') + (action.activityNote ? ` · logs: "${action.activityNote}"` : ''),
      warning: action.email ? undefined : 'No email found — use the manual form to add this candidate.',
    }
  }
  if (action.type === 'create_firm_contact') {
    const firm = action.firmMatch ? `existing firm ${action.firmMatch.name}` : `new firm "${action.firmQuery}"`
    return {
      title: `New firm contact: ${action.firstName} ${action.lastName}${action.roleTitle ? ` (${action.roleTitle})` : ''}`,
      detail: `At ${firm}${action.email ? ` — ${action.email}` : ''}` + (action.activityNote ? ` · logs: "${action.activityNote}"` : ''),
      warning: action.email ? undefined : 'No email found — use the manual form to add this contact.',
    }
  }
  return {
    title: `Log activity: ${action.targetMatch ? action.targetMatch.name : action.targetQuery}`,
    detail: action.body,
    warning: action.targetMatch ? undefined : `Couldn't find "${action.targetQuery}" in the CRM — this will be skipped.`,
  }
}

export function QuickAdd({ onDone }: { onDone?: () => void }) {
  const [text, setText] = useState('')
  const [actions, setActions] = useState<QuickAddAction[] | null>(null)
  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleParse() {
    if (!text.trim()) return
    setParsing(true)
    setError(null)
    setDone(false)
    try {
      const result = await parseNote(text.trim())
      if (result.unresolved || result.actions.length === 0) {
        setError("Couldn't work out anything to add from that — try rephrasing, or use the manual forms.")
        setActions(null)
      } else {
        setActions(result.actions)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse this note.')
    } finally {
      setParsing(false)
    }
  }

  async function handleConfirm() {
    if (!actions) return
    setSaving(true)
    setError(null)
    try {
      await executeActions(actions)
      setActions(null)
      setText('')
      setDone(true)
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-paper p-5">
      <h3 className="font-display text-sm font-semibold text-ink">Quick add</h3>
      <p className="mt-1 text-xs text-ink/40">
        Describe what happened in plain language — "Had a call with Jane Doe at Smith & Co, 5 PQE corporate
        lawyer, jane@example.com" — and it'll be turned into a candidate, firm contact or activity log for
        you to confirm.
      </p>

      {!actions && (
        <div className="mt-3 flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleParse()}
            placeholder="Had a call with…"
            className="flex-1 rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          />
          <button
            onClick={handleParse}
            disabled={parsing || !text.trim()}
            className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
          >
            {parsing ? 'Reading…' : 'Parse'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-ox">{error}</p>}
      {done && <p className="mt-2 text-sm text-ox">Saved.</p>}

      {actions && (
        <div className="mt-3 space-y-2">
          {actions.map((action, i) => {
            const { title, detail, warning } = describeAction(action)
            return (
              <div key={i} className="rounded-md border border-ink/10 p-3 text-sm">
                <p className="font-medium text-ink">{title}</p>
                {detail && <p className="mt-0.5 text-sec">{detail}</p>}
                {warning && <p className="mt-0.5 text-xs text-ox">{warning}</p>}
              </div>
            )
          })}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => {
                setActions(null)
                setText('')
              }}
              className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-sec"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !actions.some(actionIsExecutable)}
              className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Looks right, save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
