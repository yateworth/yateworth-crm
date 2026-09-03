import type { Config, Context } from '@netlify/functions'
import { getSupabaseAdmin } from './_shared/supabaseAdmin'
import { getDocumentTokenSecret } from './_shared/env'
import { verifyDocumentToken } from './_shared/documentToken'
import { escapeHtml, renderPublicPage } from './_shared/publicPage'

/**
 * Public, no-login contract-signing page — same "server-rendered HTML,
 * no SPA route, signed token" shape as unsubscribe.ts. GET renders the
 * contract and a sign form (or a status message if it's already signed/
 * void); POST processes the signature via record_contract_signature,
 * which is genuinely the only place a contract can move to 'signed' —
 * this endpoint has no elevated access of its own beyond a verified
 * token identifying which contract row to act on.
 */

interface ContractRow {
  id: string
  status: 'draft' | 'sent' | 'signed' | 'void'
  body_html_snapshot: string
  signed_at: string | null
  signed_by_name: string | null
  firms: { name: string } | null
}

function html(body: string, status = 200): Response {
  return new Response(renderPublicPage('Recruitment contract', body), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

const INVALID_LINK = '<h1>Link not valid</h1><p class="error">This link is invalid or has expired.</p>'

async function fetchContract(admin: ReturnType<typeof getSupabaseAdmin>, contractId: string) {
  const { data } = await admin
    .from('firm_contracts')
    .select('id, status, body_html_snapshot, signed_at, signed_by_name, firms(name)')
    .eq('id', contractId)
    .maybeSingle()
  return data as unknown as ContractRow | null
}

function renderContractBody(contract: ContractRow, token: string, errorMessage?: string): string {
  if (contract.status === 'void') {
    return '<h1>This contract is no longer valid</h1><p class="notice">It was withdrawn by Yateworth Recruitment. Please get in touch if you believe this is a mistake.</p>'
  }
  if (contract.status === 'signed') {
    return `<h1>Already signed</h1><p class="notice">This was signed by ${escapeHtml(contract.signed_by_name ?? 'you')} on ${new Date(contract.signed_at!).toLocaleDateString()}.</p>${contract.body_html_snapshot}`
  }
  return `
${contract.body_html_snapshot}
<hr>
<h2>Sign this agreement</h2>
${errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : ''}
<form method="POST">
  <input type="hidden" name="token" value="${escapeHtml(token)}">
  <label for="signedByName">Your full name</label>
  <input type="text" id="signedByName" name="signedByName" required>
  <div class="checkbox-row">
    <input type="checkbox" id="agree" name="agree" value="yes" required>
    <label for="agree" style="margin:0">I confirm I am authorised to sign these terms on behalf of ${escapeHtml(contract.firms?.name ?? 'this firm')}.</label>
  </div>
  <button type="submit">Sign &amp; agree</button>
</form>`
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const admin = getSupabaseAdmin()
  const secret = getDocumentTokenSecret()

  if (req.method === 'GET') {
    const token = url.searchParams.get('token') ?? ''
    const contractId = verifyDocumentToken(token, 'contract', secret)
    if (!contractId) return html(INVALID_LINK, 400)

    const contract = await fetchContract(admin, contractId)
    if (!contract) return html(INVALID_LINK, 400)

    return html(renderContractBody(contract, token))
  }

  if (req.method === 'POST') {
    const form = await req.formData()
    const token = String(form.get('token') ?? '')
    const contractId = verifyDocumentToken(token, 'contract', secret)
    if (!contractId) return html(INVALID_LINK, 400)

    const contract = await fetchContract(admin, contractId)
    if (!contract) return html(INVALID_LINK, 400)

    if (contract.status === 'void' || contract.status === 'signed') {
      return html(renderContractBody(contract, token))
    }

    const signedByName = String(form.get('signedByName') ?? '').trim()
    const agreed = form.get('agree') === 'yes'
    if (!signedByName || !agreed) {
      return html(
        renderContractBody(contract, token, 'Please enter your full name and confirm you are authorised to sign.'),
        400,
      )
    }

    const { data: emailRow } = await admin
      .from('firm_contracts')
      .select('sent_to_person_id')
      .eq('id', contractId)
      .single()
    let signedByEmail: string | null = null
    if (emailRow?.sent_to_person_id) {
      const { data: email } = await admin
        .from('email_addresses')
        .select('email')
        .eq('person_id', emailRow.sent_to_person_id)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle()
      signedByEmail = email?.email ?? null
    }

    const { error } = await admin.rpc('record_contract_signature', {
      p_contract_id: contractId,
      p_signed_by_name: signedByName,
      p_signed_by_email: signedByEmail,
      p_signature_ip: context.ip,
    })
    if (error) {
      console.error('sign-contract: record_contract_signature failed', error)
      return html('<h1>Something went wrong</h1><p class="error">Please try again shortly.</p>', 500)
    }

    const signed = await fetchContract(admin, contractId)
    return html(renderContractBody(signed!, token))
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config: Config = {
  path: '/api/sign-contract',
}
