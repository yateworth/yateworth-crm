import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

export type FileAttachment = Database['public']['Tables']['file_attachments']['Row']
export type AttachmentSubjectType = 'people' | 'firms' | 'jobs'

const BUCKET = 'attachments'

export async function fetchAttachments(
  subjectType: AttachmentSubjectType,
  subjectId: string,
): Promise<FileAttachment[]> {
  const { data, error } = await supabase
    .from('file_attachments')
    .select('*')
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

function sanitiseFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
}

export async function uploadAttachment(
  subjectType: AttachmentSubjectType,
  subjectId: string,
  file: File,
): Promise<void> {
  const storagePath = `${subjectType}/${subjectId}/${crypto.randomUUID()}-${sanitiseFileName(file.name)}`

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, file)
  if (uploadError) throw uploadError

  const {
    data: { session },
  } = await supabase.auth.getSession()

  const { error: insertError } = await supabase.from('file_attachments').insert({
    subject_type: subjectType,
    subject_id: subjectId,
    storage_path: storagePath,
    file_name: file.name,
    content_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: session?.user.id,
  })
  if (insertError) {
    await supabase.storage.from(BUCKET).remove([storagePath])
    throw insertError
  }
}

/** Signed URL, valid briefly — the bucket is private, so files aren't reachable by a bare public URL. */
export async function getAttachmentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60)
  if (error) throw error
  return data.signedUrl
}

export async function deleteAttachment(id: string, storagePath: string): Promise<void> {
  const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath])
  if (storageError) throw storageError

  const { error } = await supabase.from('file_attachments').delete().eq('id', id)
  if (error) throw error
}

export function formatFileSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
