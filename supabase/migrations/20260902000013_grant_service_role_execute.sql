-- record_unsubscribe and process_email_event are deliberately not
-- granted to anon/authenticated (see migration 12's comments) - only
-- the service role, from netlify/functions/unsubscribe.ts and
-- netlify/functions/email-webhook.ts, calls them, after verifying the
-- token/signature itself. Grant explicitly rather than relying on
-- whatever default schema privileges this project happened to start
-- with.

grant execute on function record_unsubscribe(uuid, suppression_scope, text) to service_role;
grant execute on function process_email_event(text, text, text, text, jsonb, timestamptz) to service_role;
