/**
 * Shared shell for the public, no-login document pages (contract signing,
 * invoice viewing) — same "server-rendered HTML, no SPA route" approach
 * as unsubscribe.ts, just with enough layout to read a full document
 * comfortably rather than a one-line confirmation message.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderPublicPage(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; padding: 40px 20px; background: #f7f5f2; color: #1a1a1a; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.6; }
  .card { max-width: 680px; margin: 0 auto; background: #fff; border: 1px solid #e5e0d8; border-radius: 12px; padding: 40px; }
  h1 { font-size: 1.4rem; margin-top: 0; }
  h2 { font-size: 1.1rem; margin-top: 1.5em; }
  label { display: block; font-size: 0.85rem; font-weight: 600; margin-top: 1.25rem; margin-bottom: 0.35rem; }
  input[type="text"] { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid #cbc3b6; border-radius: 8px; font-size: 1rem; }
  .checkbox-row { display: flex; align-items: flex-start; gap: 10px; margin-top: 1.25rem; font-size: 0.9rem; }
  .checkbox-row input { margin-top: 3px; }
  button { margin-top: 1.5rem; background: #b5432c; color: #fff; border: none; border-radius: 8px; padding: 12px 24px; font-size: 1rem; font-weight: 600; cursor: pointer; }
  .notice { background: #f0ede6; border-radius: 8px; padding: 16px 20px; font-size: 0.95rem; }
  .error { background: #fbe9e6; color: #8a2e1c; border-radius: 8px; padding: 16px 20px; font-size: 0.95rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  td, th { text-align: left; padding: 8px 0; border-bottom: 1px solid #e5e0d8; font-size: 0.95rem; }
  .total-row td { font-weight: 700; border-top: 2px solid #1a1a1a; border-bottom: none; }
</style>
</head>
<body>
<div class="card">
${bodyHtml}
</div>
</body>
</html>`
}
