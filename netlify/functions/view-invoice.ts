import type { Config, Context } from '@netlify/functions'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { getDocumentTokenSecret } from './_shared/env'
import { verifyDocumentToken } from './_shared/documentToken'
import { escapeHtml, renderPublicPage } from './_shared/publicPage'

/**
 * Public, no-login invoice-viewing page — same shape as sign-contract.ts,
 * but read-only: no signature to capture, just a clean rendered invoice.
 * Marks viewed_at the first time it's opened (record_invoice_viewed is
 * idempotent, so repeat opens don't move the timestamp).
 */

interface InvoiceRow {
  id: string
  invoice_number: string
  amount: number
  gst_amount: number
  total_amount: number
  issued_at: string
  due_at: string | null
  placements: {
    submissions: {
      jobs: { title: string; firms: { name: string; legal_name: string | null; address: unknown } | null } | null
      candidate_profiles: { people: { first_name: string; last_name: string } | null } | null
    } | null
  } | null
}

function money(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

function html(body: string, dateForLetterhead: string, status = 200): Response {
  return new Response(renderPublicPage('Invoice', body, dateForLetterhead), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

const INVALID_LINK = '<h1>Link not valid</h1><p class="error">This link is invalid or has expired.</p>'

export default async (req: Request, _context: Context) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? ''
  const admin = getSupabaseAdmin()

  const invoiceId = verifyDocumentToken(token, 'invoice', getDocumentTokenSecret())
  if (!invoiceId) return html(INVALID_LINK, dateLabel(new Date().toISOString()), 400)

  const { data } = await admin
    .from('invoices')
    .select(
      'id, invoice_number, amount, gst_amount, total_amount, issued_at, due_at, ' +
        'placements!inner(submissions!inner(jobs(title, firms(name, legal_name, address)), candidate_profiles(people(first_name, last_name))))',
    )
    .eq('id', invoiceId)
    .maybeSingle()

  const invoice = data as unknown as InvoiceRow | null
  if (!invoice) return html(INVALID_LINK, dateLabel(new Date().toISOString()), 400)

  await admin.rpc('record_invoice_viewed', { p_invoice_id: invoiceId })

  const job = invoice.placements?.submissions?.jobs
  const firm = job?.firms
  const candidate = invoice.placements?.submissions?.candidate_profiles?.people
  const candidateName = candidate ? `${candidate.first_name} ${candidate.last_name}` : 'the placed candidate'
  const address = (firm?.address as { full?: string } | null)?.full

  const body = `
<h1>Invoice ${escapeHtml(invoice.invoice_number)}</h1>
<p><strong>${escapeHtml(firm?.legal_name ?? firm?.name ?? 'Firm')}</strong>${address ? `<br>${escapeHtml(address)}` : ''}</p>
<p>Issued: ${dateLabel(invoice.issued_at)}${invoice.due_at ? ` &nbsp;•&nbsp; Due: ${dateLabel(invoice.due_at)}` : ''}</p>
<table>
  <tr><th>Description</th><th style="text-align:right">Amount</th></tr>
  <tr><td>Recruitment placement fee — ${escapeHtml(job?.title ?? 'role')} (${escapeHtml(candidateName)})</td><td style="text-align:right">${money(invoice.amount)}</td></tr>
  <tr><td>GST</td><td style="text-align:right">${money(invoice.gst_amount)}</td></tr>
  <tr class="total-row"><td>Total</td><td style="text-align:right">${money(invoice.total_amount)}</td></tr>
</table>
<p style="margin-top:2rem;font-size:0.85rem;color:var(--sec)">Please remit payment by the due date above. Contact Yateworth Recruitment with any questions about this invoice.</p>
<div class="actions no-print">
  <button class="btn btn-secondary" type="button" onclick="window.print()">Download PDF</button>
</div>`

  return html(body, dateLabel(invoice.issued_at))
}

export const config: Config = {
  path: '/api/view-invoice',
}
