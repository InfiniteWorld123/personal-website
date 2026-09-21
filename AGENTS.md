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
- Keep `/admin`, `src/backend/`, the legacy database, and the current public
  behavior operational until an approved cutover removes them.
- Do not make V2 write to the legacy and V2 databases simultaneously without an
  approved migration design.
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

## Working method

- Plan one bounded module at a time and obtain approval before implementation.
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
