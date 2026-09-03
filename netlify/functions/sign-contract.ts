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
  created_at: string
  signed_at: string | null
  signed_by_name: string | null
  signature_image: string | null
  firms: { name: string } | null
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

function html(body: string, dateForLetterhead: string, status = 200): Response {
  return new Response(renderPublicPage('Recruitment contract', body, dateForLetterhead), {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

const INVALID_LINK = '<h1>Link not valid</h1><p class="error">This link is invalid or has expired.</p>'

async function fetchContract(admin: ReturnType<typeof getSupabaseAdmin>, contractId: string) {
  const { data } = await admin
    .from('firm_contracts')
    .select('id, status, body_html_snapshot, created_at, signed_at, signed_by_name, signature_image, firms(name)')
    .eq('id', contractId)
    .maybeSingle()
  return data as unknown as ContractRow | null
}

// A real drawn signature, captured on a <canvas> and submitted as a PNG
// data URL — the typed name field stays for the textual/legal record,
// but this is what actually gets traced with the mouse/finger. Pointer
// Events cover mouse, touch and pen with one set of listeners.
const SIGNATURE_PAD_SCRIPT = `<script>
(function () {
  var canvas = document.getElementById('signaturePad');
  var clearBtn = document.getElementById('clearSignature');
  var hiddenInput = document.getElementById('signatureImageInput');
  var form = document.getElementById('signForm');
  if (!canvas || !form) return;
  var ctx = canvas.getContext('2d');
  var drawing = false;
  var hasDrawn = false;
  var last = null;

  function paintBackground() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#11241c';
  paintBackground();

  function pos(e) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }
  function start(e) {
    e.preventDefault();
    drawing = true;
    hasDrawn = true;
    last = pos(e);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    var p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last = p;
  }
  function end() { drawing = false; }

  canvas.addEventListener('pointerdown', start);
  canvas.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);

  clearBtn.addEventListener('click', function () {
    paintBackground();
    hasDrawn = false;
  });

  form.addEventListener('submit', function (e) {
    if (!hasDrawn) {
      e.preventDefault();
      alert('Please provide your signature by drawing in the box.');
      return;
    }
    hiddenInput.value = canvas.toDataURL('image/png');
  });
})();
</script>`

function renderContractBody(contract: ContractRow, token: string, errorMessage?: string): string {
  if (contract.status === 'void') {
    return '<h1>This contract is no longer valid</h1><p class="notice">It was withdrawn by Yateworth Recruitment. Please get in touch if you believe this is a mistake.</p>'
  }
  if (contract.status === 'signed') {
    return `<h1>Recruitment terms — signed</h1><p class="notice">Signed by ${escapeHtml(contract.signed_by_name ?? 'you')} on ${dateLabel(contract.signed_at!)}.</p>
${contract.signature_image ? `<img src="${contract.signature_image}" alt="Signature" style="max-width:280px;height:auto;display:block;margin:12px 0">` : ''}
${contract.body_html_snapshot}
<div class="actions no-print">
  <button class="btn btn-secondary" type="button" onclick="window.print()">Download PDF</button>
</div>`
  }
  return `
<h1>Recruitment terms of business</h1>
<p>Prepared for ${escapeHtml(contract.firms?.name ?? 'your firm')} on ${dateLabel(contract.created_at)}.</p>
${contract.body_html_snapshot}
<h2>Sign this agreement</h2>
${errorMessage ? `<p class="error">${escapeHtml(errorMessage)}</p>` : ''}
<form method="POST" id="signForm">
  <input type="hidden" name="token" value="${escapeHtml(token)}">
  <input type="hidden" name="signatureImage" id="signatureImageInput">
  <label for="signedByName">Your full name</label>
  <input type="text" id="signedByName" name="signedByName" required autocomplete="name">
  <div class="signature-box">
    <canvas id="signaturePad" width="600" height="160" style="width:100%;max-width:600px;height:160px;border-radius:6px;touch-action:none;cursor:crosshair"></canvas>
    <div class="signature-caption">Sign above with your mouse or finger <button type="button" id="clearSignature" class="link-btn">Clear</button></div>
  </div>
  <div class="checkbox-row">
    <input type="checkbox" id="agree" name="agree" value="yes" required>
    <label for="agree" style="margin:0">I confirm I am authorised to sign these terms on behalf of ${escapeHtml(contract.firms?.name ?? 'this firm')}.</label>
  </div>
  <div class="actions">
    <button type="submit">Sign &amp; agree</button>
    <button class="btn btn-secondary no-print" type="button" onclick="window.print()">Download PDF</button>
  </div>
</form>
${SIGNATURE_PAD_SCRIPT}`
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const admin = getSupabaseAdmin()
  const secret = getDocumentTokenSecret()

  if (req.method === 'GET') {
    const token = url.searchParams.get('token') ?? ''
    const contractId = verifyDocumentToken(token, 'contract', secret)
    if (!contractId) return html(INVALID_LINK, dateLabel(new Date().toISOString()), 400)

    const contract = await fetchContract(admin, contractId)
    if (!contract) return html(INVALID_LINK, dateLabel(new Date().toISOString()), 400)

    return html(renderContractBody(contract, token), dateLabel(contract.created_at))
  }

  if (req.method === 'POST') {
    const form = await req.formData()
    const token = String(form.get('token') ?? '')
    const contractId = verifyDocumentToken(token, 'contract', secret)
    if (!contractId) return html(INVALID_LINK, dateLabel(new Date().toISOString()), 400)

    const contract = await fetchContract(admin, contractId)
    if (!contract) return html(INVALID_LINK, dateLabel(new Date().toISOString()), 400)

    if (contract.status === 'void' || contract.status === 'signed') {
      return html(renderContractBody(contract, token), dateLabel(contract.created_at))
    }

    const signedByName = String(form.get('signedByName') ?? '').trim()
    const agreed = form.get('agree') === 'yes'
    const signatureImage = String(form.get('signatureImage') ?? '').trim()
    if (!signedByName || !agreed || !signatureImage.startsWith('data:image/')) {
      return html(
        renderContractBody(
          contract,
          token,
          'Please enter your full name, draw your signature, and confirm you are authorised to sign.',
        ),
        dateLabel(contract.created_at),
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
      p_signature_image: signatureImage,
    })
    if (error) {
      console.error('sign-contract: record_contract_signature failed', error)
      return html('<h1>Something went wrong</h1><p class="error">Please try again shortly.</p>', dateLabel(contract.created_at), 500)
    }

    const signed = await fetchContract(admin, contractId)
    return html(renderContractBody(signed!, token), dateLabel(signed!.created_at))
  }

  return new Response('Method not allowed', { status: 405 })
}

export const config: Config = {
  path: '/api/sign-contract',
}
