import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'
import type { SubjectType } from '@/lib/activities'

export type Task = Database['public']['Tables']['tasks']['Row']
export type TaskStatus = Database['public']['Enums']['task_status']

export async function fetchTasksForSubject(subjectType: SubjectType, subjectId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('due_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data
}

/** Tasks assigned to the signed-in user that are open and due today or earlier. */
export async function fetchMyDueTasks(): Promise<Task[]> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) return []

  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('assigned_to', session.user.id)
    .eq('status', 'open')
    .lte('due_at', endOfToday.toISOString())
    .order('due_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createTask(
  subjectType: SubjectType,
  subjectId: string,
  title: string,
  dueAt: string | null,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { error } = await supabase.from('tasks').insert({
    subject_type: subjectType,
    subject_id: subjectId,
    title,
    due_at: dueAt,
    assigned_to: session?.user.id,
    created_by: session?.user.id,
  })
  if (error) throw error
}

export async function setTaskStatus(id: string, status: TaskStatus): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}
