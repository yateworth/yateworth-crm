/**
 * Shared shell for the public, no-login document pages (contract signing,
 * invoice viewing) — same "server-rendered HTML, no SPA route" approach
 * as unsubscribe.ts, but dressed as an actual piece of Yateworth
 * letterhead rather than a bare utility page: these are the one place a
 * firm contact who has never seen the CRM forms an impression of it.
 * Brand tokens (colours, fonts) are ported from src/index.css so this
 * matches the app and the marketing site rather than looking like a
 * separate, unbranded system - see that file's own comment for the
 * "keep these in sync" note this inherits.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function todayLabel(): string {
  return new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function renderPublicPage(title: string, bodyHtml: string, dateLabel?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@600;700&family=Archivo:wght@400;500;600&family=Dancing+Script:wght@500;700&display=swap" rel="stylesheet">
<style>
  :root {
    --ink: #11241c; --ground: #f5f7f2; --tint: #e6ebe3; --paper: #fbfcf9;
    --sec: #2f4a3c; --ox: #7b1e2b; --ox-lift: #9b2b39; --brass: #e3b463;
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 48px 20px; background: var(--ground); color: var(--ink); font-family: "Archivo", "Helvetica Neue", Arial, sans-serif; line-height: 1.65; }
  .sheet { max-width: 700px; margin: 0 auto; background: var(--paper); border-radius: 4px; box-shadow: 0 1px 3px rgba(17,36,28,0.08), 0 12px 32px rgba(17,36,28,0.06); overflow: hidden; }
  .letterhead { background: var(--ink); color: var(--ground); padding: 28px 44px; display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  .letterhead .wordmark { font-family: "Source Serif 4", Georgia, serif; font-weight: 700; font-size: 1.5rem; letter-spacing: -0.01em; }
  .letterhead .wordmark span { color: var(--brass); }
  .letterhead .tagline { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--brass); opacity: 0.9; }
  .letterhead .date { font-size: 0.85rem; color: var(--ground); opacity: 0.85; white-space: nowrap; }
  .content { padding: 40px 44px 44px; }
  .content h1 { font-family: "Source Serif 4", Georgia, serif; font-size: 1.5rem; margin: 0 0 4px; color: var(--ink); }
  .content h2 { font-family: "Source Serif 4", Georgia, serif; font-size: 1.05rem; margin-top: 1.75em; margin-bottom: 0.5em; color: var(--ink); }
  .content p { color: var(--sec); }
  label { display: block; font-size: 0.85rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.4rem; color: var(--ink); }
  input[type="text"] { width: 100%; box-sizing: border-box; padding: 11px 13px; border: 1px solid #cbc3b6; border-radius: 6px; font-size: 1rem; font-family: inherit; background: #fff; }
  input[type="text"]:focus { outline: 2px solid var(--ox); outline-offset: 1px; }
  .checkbox-row { display: flex; align-items: flex-start; gap: 10px; margin-top: 1.25rem; font-size: 0.9rem; color: var(--sec); }
  .checkbox-row input { margin-top: 3px; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 1.75rem; }
  button, .btn { background: var(--ox); color: #fff; border: none; border-radius: 6px; padding: 13px 26px; font-size: 1rem; font-weight: 600; font-family: inherit; cursor: pointer; text-decoration: none; display: inline-block; }
  button:hover, .btn:hover { background: var(--ox-lift); }
  .btn-secondary { background: transparent; color: var(--ink); border: 1px solid #cbc3b6; }
  .btn-secondary:hover { background: var(--tint); }
  .notice { background: var(--tint); border-radius: 6px; padding: 16px 20px; font-size: 0.95rem; }
  .error { background: #fbe9e6; color: #8a2e1c; border-radius: 6px; padding: 16px 20px; font-size: 0.95rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  td, th { text-align: left; padding: 10px 0; border-bottom: 1px solid var(--tint); font-size: 0.95rem; color: var(--sec); }
  .total-row td { font-weight: 700; border-top: 2px solid var(--ink); border-bottom: none; color: var(--ink); font-size: 1.05rem; }

  /* The "sign here" box: a bordered panel with a live cursive preview of
     the typed name, so this reads as an actual signature rather than a
     plain text field - lightweight (no real e-signature vendor), but
     dressed to feel like one. */
  .signature-box { margin-top: 0.6rem; border: 1.5px dashed #cbc3b6; border-radius: 8px; padding: 20px; background: #fff; text-align: center; }
  .signature-preview { font-family: "Dancing Script", cursive; font-size: 2.1rem; color: var(--ink); min-height: 2.6rem; border-bottom: 1.5px solid var(--ink); padding-bottom: 6px; }
  .signature-preview.placeholder { color: #b6ada0; font-size: 1rem; font-family: "Archivo", sans-serif; }
  .signature-caption { margin-top: 8px; font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; color: var(--sec); }

  .footer-note { padding: 18px 44px; font-size: 0.78rem; color: var(--sec); border-top: 1px solid var(--tint); }

  @media print {
    body { background: #fff; padding: 0; }
    .sheet { box-shadow: none; max-width: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="letterhead">
    <div>
      <div class="wordmark">Yateworth<span>.</span></div>
      <div class="tagline">Legal Recruitment</div>
    </div>
    ${dateLabel ? `<div class="date">${escapeHtml(dateLabel)}</div>` : ''}
  </div>
  <div class="content">
${bodyHtml}
  </div>
  <div class="footer-note no-print">Yateworth Recruitment · this page is private to the link you were sent, please don't forward it.</div>
</div>
</body>
</html>`
}
