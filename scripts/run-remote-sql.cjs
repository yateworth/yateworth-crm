#!/usr/bin/env node
/**
 * Runs a .sql file against the linked Supabase project via the Management
 * API, using SUPABASE_ACCESS_TOKEN (a personal access token — never the
 * database password or service role key). This exists because there's no
 * local Docker/Postgres available, so `supabase test db` isn't an option;
 * every test SQL file under supabase/tests/ wraps its assertions in
 * BEGIN/ROLLBACK so nothing it does persists in real data.
 *
 * Usage: node scripts/run-remote-sql.cjs supabase/tests/permission_ledger.sql
 * Requires SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN in the environment
 * (not in any committed file).
 */
const fs = require('fs')
const path = require('path')

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error('Usage: node scripts/run-remote-sql.cjs <path-to.sql>')
  process.exit(1)
}

const projectRef = process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_ACCESS_TOKEN
if (!projectRef || !token) {
  console.error('Set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN in the environment first.')
  process.exit(1)
}

const sql = fs.readFileSync(path.resolve(sqlFile), 'utf8')

fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
}).then(async (r) => {
  const text = await r.text()
  console.log(text)
  if (!r.ok) {
    console.error(`Request failed: HTTP ${r.status}`)
    process.exitCode = 1
  } else if (/"result":"FAIL/.test(text)) {
    console.error('One or more assertions failed — see output above.')
    process.exitCode = 1
  }
})
