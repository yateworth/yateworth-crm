import { useEffect, useState, type FormEvent } from 'react'
import { Layout } from '@/components/Layout'
import { MarketingTabs } from '@/components/MarketingTabs'
import {
  createEmailTemplate,
  fetchEmailTemplates,
  type EmailTemplate,
  type PermissionPurpose,
} from '@/lib/campaigns'

export function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState<PermissionPurpose>('blog')
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [text, setText] = useState('')

  async function load() {
    setLoading(true)
    try {
      setTemplates(await fetchEmailTemplates())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load templates.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await createEmailTemplate(name, purpose, subject, html, text)
      setName('')
      setSubject('')
      setHtml('')
      setText('')
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this template.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold text-ink">Marketing</h1>
        <MarketingTabs />

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-sec">Email templates</h2>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift"
          >
            {showForm ? 'Cancel' : 'New template'}
          </button>
        </div>

        {error && <div className="rounded-lg border border-ox/30 bg-ox/5 p-3 text-sm text-ox">{error}</div>}

        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-ink/10 bg-paper p-5">
            <p className="rounded-md bg-ink/5 p-2 text-xs text-sec">
              An unsubscribe link is added automatically to every email this template is used for — you
              don't need to include one here.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="template-name" className="block text-sm font-medium text-sec">
                  Name
                </label>
                <input
                  id="template-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label htmlFor="template-purpose" className="block text-sm font-medium text-sec">
                  Purpose
                </label>
                <select
                  id="template-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value as PermissionPurpose)}
                  className="mt-1 w-full rounded-md border border-ink/20 bg-paper px-3 py-1.5 text-sm"
                >
                  <option value="blog">Blog</option>
                  <option value="recruitment">Recruitment</option>
                  <option value="report">Report</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="template-subject" className="block text-sm font-medium text-sec">
                Subject
              </label>
              <input
                id="template-subject"
                required
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm"
              />
            </div>

            <div>
              <label htmlFor="template-html" className="block text-sm font-medium text-sec">
                HTML body
              </label>
              <textarea
                id="template-html"
                required
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={6}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 font-mono text-xs"
              />
            </div>

            <div>
              <label htmlFor="template-text" className="block text-sm font-medium text-sec">
                Plain-text body
              </label>
              <textarea
                id="template-text"
                required
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border border-ink/20 px-3 py-1.5 font-mono text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save template'}
            </button>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-ink/40">No templates yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-ink/10 bg-paper">
            <table className="w-full text-sm">
              <thead className="border-b border-ink/10 text-left text-sec">
                <tr>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Purpose</th>
                  <th className="p-3 font-medium">Subject</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b border-ink/5 last:border-0 hover:bg-ground">
                    <td className="p-3 font-medium text-ink">{t.name}</td>
                    <td className="p-3 text-sec">{t.purpose}</td>
                    <td className="p-3 text-sec">{t.subject_template}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  )
}
