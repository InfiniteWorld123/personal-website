# Personal Platform V2 — Agent Guide

This repository is transitioning from a legacy platform to V2. Read
`docs/v2/foundation.md` before planning or changing V2.

## Sources of truth

- `docs/v2/foundation.md` owns the approved V2 foundation.
- An approved module specification under `docs/v2/` owns that module's intended
  behavior once it exists.
- Current code and tests describe legacy behavior only. They are evidence, not
  automatic V2 requirements.
- The two PDFs under `docs/services/` are the preserved service-pricing
  documents. Do not edit or delete them without an explicit request.

When a requirement is missing, ask. Do not recover a deleted legacy decision
from Git history and silently treat it as a V2 decision.

## Transition boundaries

- New backend code belongs under `src/backend2/`.
- The new private application lives at `/dashboard`.
- V2 uses a new database and a new migration history.
- Done on 24 Sep 2026 (owner-approved cutover): `/admin` and `src/backend/`
  were removed, and every public page reads Backend2. Keep the current public
  behavior until an approved step changes it.
- Done on 24 Sep 2026 (owner-approved): the legacy database, its Cloudflare
  connection, the legacy media bucket, the legacy secrets and the call-room
  Worker were deleted. A read-only export of the legacy rows and files is on
  the owner's Mac, never in the repository. V2 is the only database.
- Do not delete legacy code, routes, configuration, or data merely because a V2
  replacement has started.

## Public website boundary

The public website keeps its current accepted design. Backend2 will eventually
serve its data and operations, but V2 integration work must preserve the public
layout, styling, motion, routes, languages, copy, and responsive behavior unless
the owner explicitly approves a visible change.

## Dashboard boundary

- Dashboard V2 is English-only for the initial version.
- A compact full mailbox with sending, receiving, and attachments is in scope.
- The AI assistant is public-facing only; do not place an AI assistant in the
  dashboard.
- Module details are not approved until their individual specifications exist.
- Do not build V2 authentication during the initial local-only Projects slice.
  MFA is required when V2 authentication is planned later. Done on 24 Sep
  2026: the `/admin` authentication was removed and the `/dashboard` guard is
  the V2 owner session. Keep live Turnstile protections unchanged until
  separately approved work replaces them.
- Never expose owner-only Backend2 routes without approved authentication.
  Before that exists, they must be unavailable outside verified local
  development. A Git branch, hidden UI, Origin/CORS check, or URL hostname
  alone is not a security boundary; verify the non-local failure path in tests.

## Working method

- **Owner communication is part of the work.** Speak to the owner in very
  simple Arabic, even when the owner writes in English. Lead with the outcome
  and whether the owner needs to decide or do anything. Do not assume knowledge
  of Git, Cloudflare, deployment, databases, or other technical vocabulary:
  explain a necessary term in the same sentence in plain language and say
  whether it matters locally now or only before publication. Do not overload
  the owner with code, file paths, commands, test totals, or implementation
  detail unless it affects a decision, risk, or requested review. Write Arabic
  prose in its natural right-to-left order, and keep English identifiers,
  commands, filenames, and links inside backticks so mixed Arabic and English
  remains readable. Ask small, bounded batches of material
  questions and say how many important questions remain; do not create an
  endless questionnaire. Before any Cloudflare change, deployment, push,
  deletion, or other external change, state in simple Arabic what will change
  and wait for explicit authority when it was not already requested.
- Plan one bounded module at a time and obtain approval before implementation.
- This read-to-build convention applies to **every V2 module specification**
  under `docs/v2/`, not only Media. When the owner tells an implementation
  agent to "read `docs/v2/<module>.md`" to start that module, treat the request
  as approval of the documented module scope and **execute its handoff plan**;
  do not merely summarize the file or ask whether the owner wants work to
  begin. An older "draft" or "awaiting approval" status line is not a second
  approval gate after that explicit instruction. Inspect the current code and
  reconcile stale or conflicting text first; ask about genuinely material
  missing backend decisions before backend implementation, rather than
  inventing requirements. If the owner instead says "read only", "explain",
  "review", or "plan", honor that narrower request. Reading `AGENTS.md`,
  `foundation.md`, an implementation record, or a reference document is not a
  command to build the whole platform.
- Every completed module specification must contain a self-contained handoff
  prompt and this execution order: inspect the current module and ask only
  material backend questions; implement Backend2; test and verify the backend;
  then ask only material frontend/UX questions; present an isolated,
  interactive frontend Design Lab with desktop/mobile results and
  recommendations; wait for the owner's explicit visual approval; implement
  the approved production frontend; test the connected flows. If a module has
  only one side, state the adapted order in its specification. Do not stop at
  "I read the document" when implementation was requested.
- The read-to-build shorthand does not itself approve the Design Lab result,
  production deployment, public cutover, or an unrequested commit/push; those
  keep their separate approval boundaries below.
- Discuss backend and frontend requirements with the owner in the conversation,
  not through questionnaire popups unless the owner asks for one. Record the
  answers and open decisions in that module's `docs/v2/` specification before
  handing it to an implementation agent. Do not silently fill material gaps.
- For a module with both backend and frontend, follow the sequence above.
  Backend questions come before backend work; frontend questions come after
  backend verification and before the Design Lab. Wait for explicit design
  approval before production frontend work. Finally verify the connected
  flows and review exact module changes; commit and push only when the owner
  requests that Git action. Keep unrelated work out of that commit.
- An implementation agent should ask only about material unanswered decisions;
  when the approved specification is clear, complete and test the agreed phase
  without unnecessary check-ins. Do not treat a passing backend test as proof
  that the frontend or whole module is complete.
- Keep route files thin and separate transport, domain behavior, and UI state,
  but do not invent a detailed architecture before it is approved.
- For every new or materially changed form, use TanStack Form for form state and
  validation. Follow the Prime Estate interaction pattern: validate on the
  first submit attempt, then revalidate as the user changes fields; do not show
  untouched-field errors immediately on first render. With the current API,
  `revalidateLogic({ mode: "submit", modeAfterSubmission: "change" })` expresses
  this behavior.
- Show validation errors next to their fields with accessible labels,
  `aria-invalid`, and an error description; focus the first invalid field after
  an invalid submit. Show pending, success, and server-error states, and prevent
  duplicate submissions. Keep client-side limits and messages aligned with the
  shared contract, and enforce the authoritative rules again on the server.
- When a form saves drafts and publishes content, validate those actions
  separately: an incomplete private draft must remain saveable, while publishing
  must satisfy every approved public-content requirement.
- Every independently browsable V2 list needs bounded server-side pagination
  and a matching frontend control, even when the collection is currently small.
  Use a deterministic order; do not fetch every row merely to slice it in the
  browser. Manual reordering must still work across pages. Fixed navigation
  choices, small fields inside one form, and homepage previews are not full
  collection lists.
- Every implemented behavior needs proportional automated tests.
- Cover loading, empty, error, success, unauthorized, forbidden, and not-found
  states where they apply.
- Before reporting implementation complete, run typecheck, relevant tests,
  build, and real runtime or browser verification proportional to the change.
- Preserve unrelated user changes and avoid unrelated refactors.
- Never put secrets, real client data, credentials, or private attachments in
  source control, logs, fixtures, or responses.
- Use the `frontend-design` skill before building or reshaping a user-facing
  surface.

## Git and delivery

- Since 24 Sep 2026 `main` is the only branch, locally and on GitHub (the
  owner deleted `main-v2` and every other branch after V2 went live). Work and
  commit on `main`; do not create long-lived branches without the owner's
  request.
- **A push to `main` deploys the live site** (GitHub Actions: typecheck, tests,
  build, then `wrangler deploy`). A commit is local and safe; a push is a
  publication. Push only when the owner asks, after proportionate checks, and
  say in simple Arabic what will go live.
- Before committing, check the current branch, working tree, staged file list,
  and staged diff. Commit only the agreed scope. Preserve unrelated or
  in-progress owner changes; if ownership of a change is unclear, ask before
  including it. Never stage secrets, `.env` files, real client data, private
  attachments, backups, or generated build output.
- Use a descriptive commit message and report the commit, the checks and what
  was deployed. Do not force-push or rewrite published history without
  explicit approval.
