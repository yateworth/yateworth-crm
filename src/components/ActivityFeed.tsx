import { useEffect, useState, type FormEvent } from 'react'
import { fetchActivities, logActivity, type Activity, type SubjectType } from '@/lib/activities'

interface Props {
  subjectType: SubjectType
  subjectId: string
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function ActivityFeed({ subjectType, subjectId }: Props) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setActivities(await fetchActivities(subjectType, subjectId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load activity.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [subjectType, subjectId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setSubmitting(true)
    try {
      await logActivity(subjectType, subjectId, note.trim())
      setNote('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log this note.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-ink">Activity</h3>

      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Log a call, email or note…"
          className="flex-1 rounded-md border border-ink/20 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={submitting || !note.trim()}
          className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
        >
          Log
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-ox">{error}</p>}

      <div className="mt-3 space-y-3">
        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : activities.length === 0 ? (
          <p className="text-sm text-ink/40">No activity logged yet.</p>
        ) : (
          activities.map((a) => (
            <div key={a.id} className="border-b border-ink/5 pb-3 last:border-0">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-sec">
                  {a.activity_type}
                </span>
                <span className="text-xs text-ink/40">{timeAgo(a.occurred_at)}</span>
              </div>
              {a.body && <p className="mt-1 text-sm text-ink">{a.body}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
