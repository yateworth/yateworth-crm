import { useState, type FormEvent } from 'react'
import { sendDirectEmail } from '@/lib/directEmail'

interface Props {
  personId: string
  onSent?: () => void
}

export function SendEmailForm({ personId, onSent }: Props) {
  const [open, setOpen] = useState(false)
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    try {
      await sendDirectEmail(personId, subject, text)
      setSubject('')
      setText('')
      setOpen(false)
      onSent?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send this email.')
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-sec"
      >
        Send email
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-ink/10 bg-paper p-4">
      {error && <p className="text-sm text-ox">{error}</p>}
      <input
        required
        placeholder="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        className="w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
      />
      <textarea
        required
        placeholder="Write your message…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        className="w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-ink/20 px-3 py-1.5 text-sm text-sec"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={sending}
          className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  )
}
