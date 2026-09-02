import { useEffect, useState, type FormEvent } from 'react'
import { fetchTasksForSubject, createTask, setTaskStatus, type Task } from '@/lib/tasks'
import type { SubjectType } from '@/lib/activities'

interface Props {
  subjectType: SubjectType
  subjectId: string
}

export function TaskList({ subjectType, subjectId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      setTasks(await fetchTasksForSubject(subjectType, subjectId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tasks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [subjectType, subjectId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    try {
      await createTask(subjectType, subjectId, title.trim(), dueAt ? new Date(dueAt).toISOString() : null)
      setTitle('')
      setDueAt('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create this task.')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleComplete(task: Task) {
    try {
      await setTaskStatus(task.id, task.status === 'completed' ? 'open' : 'completed')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this task.')
    }
  }

  return (
    <div>
      <h3 className="font-display text-sm font-semibold text-ink">Tasks</h3>

      <form onSubmit={handleSubmit} className="mt-2 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Follow up next week…"
          className="flex-1 rounded-md border border-ink/20 px-3 py-1.5 text-sm"
        />
        <input
          type="date"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="rounded-md border border-ink/20 px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="rounded-md border-2 border-ox bg-ox px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {error && <p className="mt-2 text-sm text-ox">{error}</p>}

      <div className="mt-3 space-y-2">
        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-sm text-ink/40">No tasks yet.</p>
        ) : (
          tasks.map((task) => (
            <label key={task.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={task.status === 'completed'}
                onChange={() => toggleComplete(task)}
                className="h-4 w-4 accent-ox"
              />
              <span className={task.status === 'completed' ? 'text-ink/40 line-through' : 'text-ink'}>
                {task.title}
              </span>
              {task.due_at && (
                <span className="ml-auto text-xs text-ink/40">
                  {new Date(task.due_at).toLocaleDateString()}
                </span>
              )}
            </label>
          ))
        )}
      </div>
    </div>
  )
}
