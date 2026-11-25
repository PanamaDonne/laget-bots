---
name: mrs-security
description: >-
  Use when a pull request touches a database or RLS, auth, Edge Functions,
  user media, network calls, user data, admin tools or secrets: a security
  review of the change, not of the whole codebase.
---
# Security review

Review the diff against the base branch, not the whole codebase. Read through the host's tools; don't clone. Follow the repo's rules (`AGENTS.md`, `.cursor/rules`, engineering and API docs) and any privacy or legal checklist the project has.

## Independence

Run in a fresh session, not in the conversation that wrote the code. If the author's model family is known (for example Claude, GPT, Composer, Grok), use a different family ([vanducng, 10 Nov 2026](https://vanducng.dev/2026/11/10/running-a-coding-agent-fleet-part-1-foundation-day/)). Do not trust the author's "tests are green" or self-reported security claims: re-run the relevant tests or read CI yourself. A required proof that is missing (for example a test that unauthorized writes are denied) is a finding, not a pass. A denial test must have been seen failing once: ask the author for captured output of the test going red with the policy or check turned off, then green with it on. A denial test that passes with the policy off proves nothing ([Lucas Firmo, 8 Oct 2026](https://www.bitswithlucas.com/blog/ai-agents-on-production-code/)).

The verdict applies only to the head SHA and the exact diff you read. If the diff changes, the verdict is stale. Merge this review with the `mr-audit-code` verdict when both run.

## Web and mobile clients

- Only public env vars and the public, anon or publishable key in the client; never a service-role key.
- Do not trust client checks for authorization. The server and RLS decide.
- No `eval()`, `Function()`, or unsanitized HTML / `innerHTML`. User-controlled strings (names, messages) are escaped in the DOM and in canvas or game text.
- localStorage holds nothing sensitive and never decides permissions or accepted scores.
- Scripts and assets from own origin or pinned sources; CSP once hosting has it.
- Request only the permissions the feature needs.
- Deep links must not bypass sign-in to protected data.
- Tokens are never logged and do not remain in the URL after sign-in.

## Auth

- Redirect URLs are allowlisted in the auth provider and in code; no open redirect via query parameters.
- The official client manages the session.
- Rate-limit sending of magic links or one-time codes; error messages do not reveal whether an account exists.

## Database and RLS (including Supabase)

- Every new or changed table in `public` has RLS on.
- Catalog or reference tables are read-only for `anon` and `authenticated`: SELECT policies only, write grants revoked.
- User data is scoped with `auth.uid()` in the policy, never with an id the client sends.
- Server-owned columns (`created_at`, status, score, rank, role and similar) are not client-writable.
- Functions and RPC use `security invoker` unless there is a justified reason for `definer`, and set `search_path = ''`. `security definer` admin RPCs include an explicit server-side role check.
- **Leaderboards and scores:** the client cannot write scores directly. Scores go through an RPC or Edge Function that validates (sane cap, time, level, one row per attempt) and sets `user_id` from `auth.uid()`. Public reads only of columns meant to be shown (never email).
- **Admin tools:** role checked on the server (claim or admin table with RLS), never a client flag.
- Tests prove RLS is on and that `anon` and `authenticated` cannot write what they shouldn't.
- Migrations should be idempotent where reasonable. No agent runs them against the hosted database.

## Outside-in check (Supabase and similar backends)

Reading the diff misses tables, views, buckets and functions that were already exposed before this PR. When the PR touches the schema, policies, grants, storage or RPC, also check from the outside, the way an attacker would:

- Run the platform's deterministic security checks on the branch or preview database: Supabase Security Advisor (`get_advisors` with `type: security` in the MCP, `supabase db advisors` in the CLI, or Studio). Any ERROR-level finding (for example `rls_disabled_in_public`, `security_definer_view`, `sensitive_columns_exposed`) is blocking unless the PR explains why it is intended. Also read WARN findings such as `permissive_rls_policy`, `public_bucket_allows_listing` and `pg_graphql_anon_table_exposed` ([Supabase Advisors](https://supabase.com/docs/guides/observability/advisors)).
- With only the publishable / anon key that ships in the client, try to read every exposed table and view, list every storage bucket, and call every RPC. Repeat as a signed-in test user against another test user's rows. Expected result: only data meant to be public. Anything else is blocking. Use a preview or branch database with test data, never production.
- Grants are separate from policies. On many projects a new table in `public` starts with every privilege granted to `anon` and `authenticated`, and adding policies does not revoke them. Check that grants match what each role should do ([Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security)).

Why: a Common Crawl scan of 34,545 Lovable apps on Supabase found email-bearing records readable without login on 7,403 of the 24,664 sites that served data on load (the authors say this is not a confirmed leak rate) ([Crissy Field, Nov 2026](https://www.crissyfield.de/research/lovable-en/)). Advisors are static checks and do not replace the probe or a human review of the access model.

## Edge Functions and APIs

- `verify_jwt = true` unless the function is explicitly public.
- Validate method, content-type and size (for example 413 over the limit) before anything else.
- Generic errors to the client; no stack traces, tokens or internal ids in logs or responses.
- CORS is narrow in production, not `*`.
- Secrets come from the platform's secret store and are never hardcoded.

## Media and privacy

- User media is never saved (not in Storage, a table, the photo library or app documents), never logged, and never sent to a cloud model until the project's privacy review is done (processor terms, expected region, no retention, EXIF stripped).
- Capture with `exif: false` (or equivalent). Re-encoding should strip EXIF and location.
- Temporary files are deleted on continue, retry, unmount and error (`finally`).
- No image bytes or base64 in logs, crash reports or analytics.

## Secrets, CI and dependencies

- No `.env`, keys or keystores in the repo. The secret scanner must run and must not have `continue-on-error` on checks that should block.
- CI permissions are least privilege (`permissions:` in the workflow). Pin actions.
- Note known vulnerabilities from `npm audit` (or equivalent). Exceptions need an `expires` date and whether the package reaches runtime.
- Deploy from the default branch via workflow, not a hand-built artifact.

## Personal data

Email, display names and similar are personal data: minimize, allow account deletion, no unnecessary third-party trackers. Escalate to the project's privacy owner when unsure.

## Reviewer is read-only; cap fix rounds

Do not edit, push, merge or fix the code. After three rounds without Approved, stop, keep the open findings and escalate to the user. Do not start a fourth fix loop. Some failures are spec problems, not code problems ([Gonza Gomez, 9 Nov 2026](https://ggomez.dev/blog/claude-code-agent-team)).

## Output

For each issue: file and line, the risk in plain words, a concrete fix that fits the codebase, and severity (blocking, should fix, nit). Merge with the verdict from `mr-audit-code` (Approved / Changes required / Risks). State what needs a migration, a function deploy, or a manual change in the provider console. Don't fix the code; merge only after the user has approved.
