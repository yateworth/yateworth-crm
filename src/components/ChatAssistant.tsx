import { useEffect, useRef, useState } from 'react'
import { sendChatMessage, actionIsExecutable, runAction, type QuickAddAction } from '@/lib/aiChat'

interface ChatMessage {
  role: 'user' | 'assistant'
  text?: string
  actions?: QuickAddAction[]
  outcomes?: (string | null)[]
}

function describeAction(action: QuickAddAction): { title: string; detail: string; warning?: string } {
  if (action.type === 'create_candidate') {
    const bits = [action.currentTitle, action.yearsPqe != null ? `${action.yearsPqe} PQE` : null]
      .filter(Boolean)
      .join(' · ')
    return {
      title: `New candidate: ${action.firstName} ${action.lastName}`,
      detail:
        [bits, action.email].filter(Boolean).join(' — ') +
        (action.activityNote ? ` · logs: "${action.activityNote}"` : ''),
      warning: action.email ? undefined : 'No email — reply with one to enable this.',
    }
  }
  if (action.type === 'create_firm_contact') {
    const firm = action.firmMatch ? `existing firm ${action.firmMatch.name}` : `new firm "${action.firmQuery}"`
    return {
      title: `New firm contact: ${action.firstName} ${action.lastName}${action.roleTitle ? ` (${action.roleTitle})` : ''}`,
      detail:
        `At ${firm}${action.email ? ` — ${action.email}` : ''}` +
        (action.activityNote ? ` · logs: "${action.activityNote}"` : ''),
      warning: action.email ? undefined : 'No email — reply with one to enable this.',
    }
  }
  return {
    title: `Log activity: ${action.targetMatch ? action.targetMatch.name : action.targetQuery}`,
    detail: action.body,
    warning: action.targetMatch ? undefined : `Couldn't find "${action.targetQuery}" in the CRM.`,
  }
}

function transcriptFor(messages: ChatMessage[]): { role: 'user' | 'assistant'; text: string }[] {
  return messages.map((m) => {
    if (m.role === 'user') return { role: 'user' as const, text: m.text ?? '' }
    let text = m.text ?? ''
    if (m.actions) {
      const summaries = m.actions.map((a, i) => {
        const { title } = describeAction(a)
        const outcome = m.outcomes?.[i]
        return outcome ? `${title} — ${outcome}` : `${title} (awaiting confirmation)`
      })
      text = [text, ...summaries].filter(Boolean).join('\n')
    }
    return { role: 'assistant' as const, text }
  })
}

export function ChatAssistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || sending) return
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', text }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    setError(null)
    try {
      const result = await sendChatMessage(transcriptFor(nextMessages))
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          text: result.text ?? undefined,
          actions: result.actions.length > 0 ? result.actions : undefined,
          outcomes: result.actions.length > 0 ? result.actions.map(() => null) : undefined,
        },
      ])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the assistant.')
    } finally {
      setSending(false)
    }
  }

  async function handleActionResolve(messageIndex: number, actionIndex: number, confirmed: boolean) {
    const message = messages[messageIndex]
    const action = message.actions?.[actionIndex]
    if (!action) return

    const outcome = confirmed ? await runAction(action).catch((err) => `Failed: ${err.message}`) : 'Skipped.'

    setMessages((prev) =>
      prev.map((m, i) => {
        if (i !== messageIndex) return m
        const outcomes = [...(m.outcomes ?? [])]
        outcomes[actionIndex] = outcome
        return { ...m, outcomes }
      }),
    )
  }

  return (
    <div className="flex h-[32rem] flex-col rounded-lg border border-ink/10 bg-paper">
      <div className="border-b border-ink/10 p-4">
        <h3 className="font-display text-sm font-semibold text-ink">Assistant</h3>
        <p className="mt-1 text-xs text-ink/40">
          Ask about candidates, firms or what needs follow-up, or describe something to add — "Had a call
          with Jane Doe at Smith & Co, 5 PQE corporate lawyer" — it'll ask if it needs more.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-sm text-ink/40">Ask a question, or describe something to add.</p>}

        {messages.map((m, mi) => (
          <div key={mi} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-ox text-white' : 'bg-ink/5 text-ink'
              }`}
            >
              {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
              {m.actions && (
                <div className={`space-y-2 ${m.text ? 'mt-2' : ''}`}>
                  {m.actions.map((action, ai) => {
                    const { title, detail, warning } = describeAction(action)
                    const outcome = m.outcomes?.[ai] ?? null
                    return (
                      <div key={ai} className="rounded-md border border-ink/10 bg-paper p-2 text-ink">
                        <p className="font-medium">{title}</p>
                        {detail && <p className="mt-0.5 text-xs text-sec">{detail}</p>}
                        {warning && <p className="mt-0.5 text-xs text-ox">{warning}</p>}
                        {outcome ? (
                          <p className="mt-1 text-xs text-ox">{outcome}</p>
                        ) : (
                          <div className="mt-1.5 flex gap-2">
                            <button
                              onClick={() => handleActionResolve(mi, ai, true)}
                              disabled={!actionIsExecutable(action)}
                              className="rounded-md border-2 border-ox bg-ox px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleActionResolve(mi, ai, false)}
                              className="rounded-md border border-ink/20 px-2 py-1 text-xs text-sec"
                            >
                              Skip
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <p className="text-sm text-ink/40">Thinking…</p>}
        {error && <p className="text-sm text-ox">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-ink/10 p-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask a question, or describe something to add…"
          className="flex-1 rounded-md border border-ink/20 px-3 py-1.5 text-sm"
        />
        <button
          onClick={handleSend}
          disabled={sending || !input.trim()}
          className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  )
}
