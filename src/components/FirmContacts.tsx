import { useEffect, useState, type FormEvent } from 'react'
import {
  fetchFirmContacts,
  createFirmContact,
  removeFirmContact,
  type FirmContact,
  type CreateFirmContactInput,
} from '@/lib/firms'

const emptyForm: CreateFirmContactInput = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  roleTitle: '',
  isPrimary: false,
}

export function FirmContacts({ firmId }: { firmId: string }) {
  const [contacts, setContacts] = useState<FirmContact[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<CreateFirmContactInput>(emptyForm)

  async function load() {
    setLoading(true)
    try {
      setContacts(await fetchFirmContacts(firmId))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load contacts.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firmId])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await createFirmContact(firmId, form)
      setForm(emptyForm)
      setShowForm(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this contact.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleRemove(id: string) {
    setError(null)
    try {
      await removeFirmContact(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this contact.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-ink">Contacts</h3>
        <button onClick={() => setShowForm((s) => !s)} className="text-sm text-ox hover:underline">
          {showForm ? 'Cancel' : 'Add contact'}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-ox">{error}</p>}

      {showForm && (
        <form onSubmit={handleSubmit} className="mt-3 space-y-2 rounded-md border border-ink/10 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder="First name"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              className="rounded-md border border-ink/20 px-2 py-1 text-sm"
            />
            <input
              required
              placeholder="Last name"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              className="rounded-md border border-ink/20 px-2 py-1 text-sm"
            />
            <input
              type="email"
              placeholder="Email (optional)"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="rounded-md border border-ink/20 px-2 py-1 text-sm"
            />
            <input
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="rounded-md border border-ink/20 px-2 py-1 text-sm"
            />
            <input
              placeholder="Role (e.g. HR Manager)"
              value={form.roleTitle}
              onChange={(e) => setForm((f) => ({ ...f, roleTitle: e.target.value }))}
              className="col-span-2 rounded-md border border-ink/20 px-2 py-1 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-sec">
            <input
              type="checkbox"
              checked={form.isPrimary}
              onChange={(e) => setForm((f) => ({ ...f, isPrimary: e.target.checked }))}
              className="h-4 w-4 accent-ox"
            />
            Primary contact for this firm
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg border-2 border-ox bg-ox px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ox-lift disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save contact'}
          </button>
        </form>
      )}

      <div className="mt-3 space-y-2">
        {loading ? (
          <p className="text-sm text-sec">Loading…</p>
        ) : contacts.length === 0 ? (
          <p className="text-sm text-ink/40">No contacts yet.</p>
        ) : (
          contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="font-medium text-ink">
                  {c.first_name} {c.last_name}
                </span>
                {c.is_primary && (
                  <span className="ml-2 rounded-full bg-brass/20 px-2 py-0.5 text-xs font-medium text-brass">
                    Primary
                  </span>
                )}
                <p className="text-xs text-ink/40">
                  {[c.role_title, c.email, c.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button onClick={() => handleRemove(c.id)} className="text-xs text-ink/40 hover:text-ox">
                Remove
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
