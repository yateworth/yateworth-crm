import { useEffect, useRef, useState } from 'react'
import {
  fetchAttachments,
  uploadAttachment,
  getAttachmentUrl,
  deleteAttachment,
  formatFileSize,
  type FileAttachment,
  type AttachmentSubjectType,
} from '@/lib/attachments'

interface Props {
  subjectType: AttachmentSubjectType
  subjectId: string
}

export function FileAttachments({ subjectType, subjectId }: Props) {
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try {
      setFiles(await fetchAttachments(subjectType, subjectId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load files.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectType, subjectId])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      await uploadAttachment(subjectType, subjectId, file)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload this file.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleOpen(file: FileAttachment) {
    try {
      const url = await getAttachmentUrl(file.storage_path)
      window.open(url, '_blank', 'noopener')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open this file.')
    }
  }

  async function handleDelete(file: FileAttachment) {
    try {
      await deleteAttachment(file.id, file.storage_path)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this file.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink">Files</h3>
        <label className="cursor-pointer text-sm text-ox hover:underline">
          {uploading ? 'Uploading…' : 'Upload file'}
          <input
            ref={inputRef}
            type="file"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>

      {error && <p className="mt-2 text-sm text-ox">{error}</p>}

      <div className="mt-3 space-y-2">
        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-ink/40">No files yet — CVs, job specs, firm documents.</p>
        ) : (
          files.map((f) => (
            <div key={f.id} className="flex items-center justify-between text-sm">
              <button onClick={() => handleOpen(f)} className="text-left text-ink hover:underline">
                {f.file_name}
              </button>
              <div className="flex items-center gap-2 text-xs text-ink/40">
                <span>{formatFileSize(f.size_bytes)}</span>
                <span>{new Date(f.created_at).toLocaleDateString()}</span>
                <button onClick={() => handleDelete(f)} className="hover:text-ox">
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
