import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type Activity = Database['public']['Tables']['activities']['Row']
export type SubjectType = 'people' | 'firms'

export async function fetchActivities(subjectType: SubjectType, subjectId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('occurred_at', { ascending: false })
  if (error) throw error
  return data
}

export async function logActivity(
  subjectType: SubjectType,
  subjectId: string,
  body: string,
  activityType: string = 'note',
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { error } = await supabase.from('activities').insert({
    subject_type: subjectType,
    subject_id: subjectId,
    activity_type: activityType,
    body,
    created_by: session?.user.id,
  })
  if (error) throw error
}
