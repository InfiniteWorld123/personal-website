# Public AI Assistant V2 — owner product plan

Status: **owner-facing product questions answered (23 Sep 2026); ready for owner review and an implementation handoff under `AGENTS.md`.** This document does not authorize a paid AI account, a public deploy, or indefinite personal-data retention as legally compliant. Verify the privacy/retention basis before a real visitor's conversation is stored in production.

Read `docs/v2/foundation.md` first. The assistant is for visitors on the public website, never an AI assistant inside `/dashboard`. The existing public chat widget and legacy chat backend are implementation evidence, not automatic V2 requirements. Preserve the accepted public design until the owner approves any visual change.

## Confirmed owner decisions

- The assistant only answers a visitor's questions. It does not proactively question the visitor, qualify leads, recommend a service through an interview, or create a Lead automatically.
- It may repeat prices that are actually published, but must not invent a custom quote, promise a result, or imply that it has agreed commercial terms. For a custom price it directs the visitor to the owner.
- It responds in the language the visitor uses: German, English, or Arabic, even when that differs from the page language.
- When a visitor wants to speak with the owner, it directs them to the existing contact form or booking flow. It does not collect their name/email in chat or send a new Inbox conversation on its own.
- The owner wants to read the conversations in a private Dashboard view, to understand what visitors ask. A private transcript is not permission to make the conversation public or feed it to an unrelated provider.
- The primary and initial knowledge source is the owner's **published public website content**, including published Services, Projects, Blog articles, FAQs, and static pages. Follow publication/update/unpublication changes; never read drafts or private Dashboard data. The owner may **later** add a small set of manually curated questions and answers when published content does not cover a useful question. That editing feature is deferred from the first release and is supplementary, not a replacement for the site as the first source.
- The owner prefers to retain private conversation transcripts until deleting them manually, whether soon or much later. Provide per-conversation owner deletion. This is a requested product behavior, **not** approval to retain identifiable visitor text indefinitely in production: determine a defensible retention/review policy, visitor notice, and deletion-request process before launch. If indefinite identifiable storage cannot be justified, present the owner with a clear alternative (such as anonymized long-term questions plus time-limited raw transcripts) rather than silently changing or shipping the preference.
- AI spending should be **$0 if feasible**, with **$5/month as an absolute maximum the owner is willing to consider**, not an automatic authorization to activate a paid plan or allow overage. The owner has explicitly said money is very tight. A no-cost, non-generative fallback or temporarily disabled assistant is preferable to an unexpected charge. Verify free-tier terms, provider privacy, limits, model quality in DE/EN/AR, and a real application-level spending/usage cutoff before selecting a provider. Do not buy credits or upgrade a plan without explicit approval.
- Owner-only records such as Inbox, Leads, Clients, invoices, unpublished drafts, and private Media are never knowledge sources for a public assistant.

## Product and system boundaries

- Public chat is question-and-answer only, not a booking agent, sales interviewer, lead qualifier, or autonomous actor. It may link to the existing Contact or Booking flow, but does not create a booking, email, Lead, Client, or quote itself.
- Answers are grounded in currently published approved content, with links to their public source when practical. A missing or ambiguous answer becomes an honest "I don't know from the website" and a Contact/Booking link, not a guess. Published prices may be repeated with their qualifications; custom prices, discounts, dates, guarantees, and commercial commitments may not be invented.
- The response language follows the visitor's message, not merely the current page locale. Support German, English, and Arabic; preserve Arabic right-to-left presentation.
- Site content remains the source of truth. Re-index or refresh it on publication/change/unpublication so a withdrawn page or price stops informing new answers. A manually curated Q&A may be added later through a separate owner-controlled surface and must not smuggle private content into the public answer set.
- Conversations and messages are private records for the owner. The visitor receives a clear notice that a machine answers and that conversations may be saved, with a route to the privacy policy. Owner list/search and detail views are private and server-paginated. Manual deletion must remove the conversation from the application and cover dependent stored text; backup/retention handling must be stated accurately.
- Do not select a provider solely because it is free or based in a particular country. Check the current account plan, free quota, data handling, security, and response quality before using it. Cloudflare Workers AI currently documents a free daily allocation, but that is not a promise of unlimited zero-cost operation: https://developers.cloudflare.com/workers-ai/platform/pricing/ . The safest launch path may be the existing no-model FAQ fallback while a zero-cost provider is verified.

## Backend and API contract to finalize before coding

The implementation agent should inspect existing V2 public-content APIs, Auth, pagination conventions, and the legacy chat only as evidence. It must propose a small route inventory before implementation: a rate-limited public ask endpoint, a public non-sensitive chat-introduction/availability endpoint if needed, and protected owner endpoints to list/read/delete conversations. Owner-curated Q&A editing is **not** in the initial API; leave a clean later extension point rather than building unused CRUD. Keep transport routes thin and separate content retrieval, response composition, transcript storage, and abuse/cost controls. The authoritative privacy and rate-limit rules are server-side, not only in the widget.

## Frontend experience to plan after backend verification

- Preserve the existing accepted public website design and the intent of the existing chat widget unless the owner approves a visible change. The visitor can open the chat, ask a question, read a concise answer, follow a source or Contact/Booking link, and understand when the free quota or answer source is unavailable. Do not make the widget block the page.
- Add a private conversation viewer in Dashboard only as a transcript-management surface, **not** as a Dashboard AI assistant. It needs loading, empty, error, pagination, language, date, detail, and deliberate delete states. Include a privacy/retention explanation visible to the owner.
- Ask the owner only material UX questions after backend verification. Present an isolated interactive Design Lab with desktop and mobile views and wait for explicit approval before production frontend changes.

## Later implementation/design checks

- Verify the chosen zero-cost route in the actual account; free quotas and model availability can change. Handle exhaustion/abuse without charging, and show a helpful contact/booking fallback.
- Prevent ungrounded answers and unsupported prices; test real German, English, and Arabic questions and out-of-scope prompts. A model failure must not look like a confident answer.
- Keep the transcript viewer private and paginated; plan access, retention, deletion, and privacy notice. Do not log secrets or visitor text indiscriminately.
- Verify a lawful, proportionate retention/review policy for identifiable transcripts before live launch. The European Commission explains the storage-limitation principle and the need for deletion or review periods: https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en . Do not label owner-only manual deletion as automatically compliant.
- Test that unpublished Services/Projects/Blog entries and private prices cannot be retrieved, and that content changes invalidate stale answer material. Include access control, abuse/rate limits, spend cap/fallback, transcript deletion, and source-grounding tests, plus real local/browser verification, typecheck, and build.

## Self-contained handoff to Claude / the implementation agent

When the owner explicitly asks you to read this document to start the module, treat that as approval of this bounded module under `AGENTS.md`, **not** permission for deployment, paid-provider activation, or a public cutover. Read `AGENTS.md`, `docs/v2/foundation.md`, and this whole specification; inspect current code and preserve unrelated changes. Before Backend2 work, propose the small API route inventory and ask only genuinely material backend questions. Implement and test the backend with a free/no-model fallback, published-content boundaries, private transcripts, and hard cost/abuse controls. If provider privacy or transcript retention cannot be verified for real visitors, leave the unsafe live path disabled and report exactly what is blocked; safely separable local/test work may continue. After backend verification, ask only material frontend questions, show an isolated interactive desktop/mobile Design Lab and wait for the owner's explicit visual approval. Then implement and test the connected public widget and owner-only transcript viewer. Report working, unverified, and blocked parts in simple Arabic. Commit/push only if the owner separately requests it, and never deploy or activate spending without separate authorization.

## Backend implementation record (23 Sep 2026)

Status: **Backend2 built and tested locally; nothing deployed, no provider activated, public widget and Dashboard viewer not built yet.** Built overnight on the owner's authorization. Every decision below was made by the implementation agent where this spec was silent; each is reversible and listed so the owner can change it.

### What exists

- Migration `0013_assistant.sql` (structure only, no rows): `v2_assistant_settings` (single optional row), `v2_assistant_conversations`, `v2_assistant_messages` (`ON DELETE CASCADE` from the conversation), `v2_assistant_usage_days` (anonymous daily counters, no text). Not applied to any real database — the owner runs `bun run db2:migrate` himself when ready.
- Module `src/backend2/modules/assistant/`: `assistant.knowledge.ts` (published content + cache), `assistant.retrieval.ts` (scoring), `assistant.compose.ts` (answers + money guard), `assistant.provider.ts` (optional model), `assistant.language.ts` (detection + DE/EN/AR wording), `assistant.text.ts` (normalisation, intents, amounts), `assistant.repo.ts`, `assistant.service.ts`, `assistant.public.route.ts`, `assistant.owner.route.ts`, `assistant.analytics.ts`, `assistant.purge.ts`. Contract: `src/backend2/contracts/assistant.contract.ts`. Error code `ASSISTANT_UNAVAILABLE` in `http/error.ts`.
- Script `bun run db2:assistant:purge` applies the retention setting once.

### Routes

Public (mounted only where `DATABASE_URL_V2` is configured, `Cache-Control: no-store`):

- `GET /api/v2/assistant/status?language=de|en|ar` → `{ enabled, mode: 'extractive'|'generative', notice: { key: 'assistant.notice.v1', text }, links: [contact, booking, privacy], limits: { messageMaxLength: 1000 } }`.
- `POST /api/v2/assistant/ask` body `{ conversationId?: string|null, message: string (1–1000 chars after trimming), locale?: 'de'|'en'|'ar'|null }` (body ≤ 8 KB) → `{ conversationId, answer: { text, language, outcome, provider, sources: [{kind,title,url}], links: [{kind,label,url}] } }`. Refusals: `409 ASSISTANT_UNAVAILABLE` with `details.reason` `disabled` or `daily_limit` (a 4xx on purpose, like `SEND_FAILED`, because a 5xx hides the reason); `429 RATE_LIMITED` with `details.reason: 'too_fast'` and `retryAfter`; `422` validation; `413` oversize.

Owner (inside the `/owner` fence: 404 off-local or without `BACKEND2_OWNER_API=local`; 401 when `BACKEND2_OWNER_AUTH=required` and no session):

- `GET /api/v2/owner/assistant/conversations?page&pageSize(≤100)&language=all|de|en|ar&from=YYYY-MM-DD&to=YYYY-MM-DD&search&outcome=all|fallback` → standard `Page<{ id, language, pageLocale, preview, messageCount, fallbackCount, createdAt, lastMessageAt }>`, ordered `last_message_at DESC, id DESC`. Dates are UTC days; search matches any message (visitor or reply).
- `GET /api/v2/owner/assistant/conversations/:id` → the conversation plus every message in order (bounded: 40 questions per conversation, then a new one starts).
- `DELETE /api/v2/owner/assistant/conversations/:id` → `{ id, deleted: true }`; messages go with it. Permanent, no trash.
- `GET /api/v2/owner/assistant/usage?days=1..90` → per-UTC-day counters (zeros filled), `provider: { configured, dailyCap, usedToday, active }`, `dailyQuestionLimit`, `estimatedCostCents: 0`.
- `GET /api/v2/owner/assistant/settings`, `PATCH /api/v2/owner/assistant/settings` `{ enabled?, retentionMode?: 'manual'|'days', retentionDays?: 1..3650 }`. *Added beyond the proposed inventory*: the on/off switch and the retention setting need an owner-controlled place to live.

### Decisions (owner can change)

1. **Off by default.** With no saved settings the assistant answers nothing (`409 disabled`); the owner switches it on in settings. Chosen because transcript retention is not yet privacy-reviewed.
2. **Knowledge = only published V2 content, read through the modules' own public readers**: `listPublicServices`/`readPublicService` (name, summary, included, body, published price with its qualifications — "from", period, an active offer), `listPublicProjects`/`readPublicProject` (name, category, summary, tech, case-study text — never the hidden client name), `listPublicPosts`/`readPublicPost` (title, summary, tags, body text), and `readPublicContent` (the published value or the release default — FAQ question/answer pairs, plus copy sections of home, services, work, about, blog, contact, stack; plus the public email/phone/city facts). SEO text, legal pages, the shell and 404 copy are excluded. Drafts, schedules, Leads, Clients, Inbox, invoices and private media are never reached. Bounded to 60 items per module and 6,000 characters per document.
3. **Freshness**: documents are cached per language and keyed by a fingerprint of publication bookkeeping (ids, live-version pointers, publish times, revisions, content revisions) read on every question. Publish, update, unpublish, archive, delete or a Content save changes it, so the next question rebuilds — no waiting period. Due scheduled articles are caught up first, as the public Blog does.
4. **Retrieval** is a small lexical scorer (no model, no paid index): stopwords and normalisation for DE/EN/AR (Arabic letter variants, the article `ال`, umlauts), five-letter stems, title matches count double, very common words count half, and a word the site never uses counts heaviest. A passage must reach a score threshold **and** cover ≥ 60 % of the question's weight; a price question is answered only by a published price or a passage about prices. Up to 3 sources close to the best one.
5. **Answering, provider `none` (default)**: the reply is the published wording — best-matching sentences per source, the service's price line, source links — framed by a short DE/EN/AR template. A price question always adds "for a custom quote use the contact form" plus Contact/Booking links. Nothing found → an honest "I couldn't find that on the website" with Contact/Booking (`outcome: 'fallback'`). A request to reach the owner → Contact/Booking (`handoff`). A bare greeting → a short hint (`smalltalk`).
6. **Optional model, off**: `ASSISTANT_PROVIDER=workers-ai` + `ASSISTANT_WORKERS_AI_ACCOUNT_ID` + `ASSISTANT_WORKERS_AI_TOKEN` (+ optional `ASSISTANT_WORKERS_AI_MODEL`, default `@cf/meta/llama-3.1-8b-instruct`) over Cloudflare's REST API. It is still never called unless `ASSISTANT_DAILY_PROVIDER_CALLS` > 0 (default **0**). Each call reserves one unit of today's UTC allowance in `v2_assistant_usage_days` *before* calling (atomic, so parallel Workers cannot overspend); at the cap, answers fall back to `none`. The model receives only the retrieved published snippets and must answer from them or say `NOT_IN_SNIPPETS`. Its answer is discarded — and the `none` answer sent — on any failure, timeout (12 s), or if it names **any amount not present in the snippets** (money guard, handles `1.490 €`, `€1,490`, `1,490 EUR`, Arabic digits). A question with no retrieval hit never reaches the model. Tests use a fake adapter only.
7. **Language**: Arabic script → `ar`; otherwise German vs English marker words (umlauts count for German); a tie or no marker falls to the page locale when it is `de`/`en`, else `en`. The answer and its template follow the detected language; sources come from that language's published text.
8. **Abuse and cost**: per sender 8/minute, 60/hour, 150/day, counted in the existing `v2_auth_rate_limits` table under a keyed hash of `requestIdentity` (never the address); a site-wide ceiling `ASSISTANT_DAILY_QUESTION_LIMIT` (default 500 questions per UTC day). Refusals store nothing but a counter.
9. **Privacy**: stored are the conversation language, page locale, created/last-message times, and message text with outcome, provider and source links. No IP, no user agent, no name/email field. The browser keeps a random 256-bit handle; only its SHA-256 is stored. The status endpoint provides the notice (machine answers, conversations may be saved and read by the owner, do not enter personal data) and the privacy-policy link. Visitor text is never logged.
10. **Retention**: setting `manual` (default, the owner's stated wish) keeps conversations until the owner deletes them; `days` + N deletes conversations idle longer than N days — applied by `bun run db2:assistant:purge` and opportunistically before new questions. **Indefinite retention of identifiable visitor text still needs a privacy review before live launch** (policy wording, deletion-request process, and whether database backups/point-in-time restore keep deleted text for their retention window). Not reviewed; not claimed compliant.
11. Deleting a transcript does not change the anonymous daily counters (they hold no text).

### Analytics hook (`assistant.analytics.ts`, read-only)

- `readAssistantActivity({ from, to }): Promise<AssistantActivityDay[]>` — one row per UTC day in the inclusive range (≤ 366 days, zeros filled): `conversations, questions, answered, fallbacks (unanswered), handoffs, contactOffers, providerCalls, providerFallbacks, rateLimited, capped, costCents (always 0)`.
- `readAssistantTotals({ from, to }): Promise<AssistantActivityTotals>` — the same summed, plus `answerRate`.
- `readAssistantStoredCounts(): Promise<{ conversations, messages }>` — transcripts currently stored.

### Verified

`src/tests/backend2-assistant.test.ts` (in-process PGlite) and `src/tests/backend2-assistant-rules.test.ts` (pure): off-by-default refusal; grounding (unpublished service/draft article never used; unpublishing removes a service at once; a pending draft edit and its price are never used; hidden client name never appears; FAQ answers and a Content save changes the next answer); DE/EN/AR detection and answer language; unknown-question fallback; handoff and smalltalk; model never called at cap 0, called within the cap, invented price discarded, failure/unknown fall back, cap reached → `none`; per-sender rate limit with hashed keys; site-wide daily ceiling; body/length limits; handle stored hashed and no address stored; owner list pagination/filters/search/date, detail order, delete removes messages; usage and analytics aggregates; retention purge (`manual` deletes nothing, `days` deletes idle conversations); owner routes 404 off-local and absent without the flag, 401 with auth required. `backend2-migrations.test.ts` includes 0013. Typecheck clean for this module. Not run: a real Workers AI call, the Vite build and a browser flow (no frontend yet; the build was left to the integration pass because other agents were changing shared generated files at the same time).

### Blocked / disabled on purpose

- Generative answers: no provider approved; cap defaults to 0. Before enabling: verify the Cloudflare account's free Workers AI allocation, data handling, DE/EN/AR quality, and set the cap as an encrypted secret.
- Live launch: needs the privacy/retention review above, the migration applied to the real V2 database, and the public widget cutover (approval required).
- Owner-curated Q&A: deferred as specified. Extension point: add a fourth document source in `buildKnowledge` (kind `faq`), read from a future owner table.

### What the Design Lab needs

- **Public widget**: read `/assistant/status` first; hide or show a friendly "use the contact form" state when `enabled` is false; show the notice (and privacy link) before the first question; keep `conversationId` in the tab (session storage) and send it back; render `answer.text` as plain text with line breaks and `•` bullets, `sources` as links, `links` as Contact/Booking buttons; RTL for `language: 'ar'` per answer (the answer language can differ from the page); states for sending, `429` (wait and retry), `409 daily_limit`/`disabled` (contact fallback), `422` (too long; counter from `limits.messageMaxLength`), network error. It must not block the page. Existing public widget design is preserved unless the owner approves a change.
- **Owner transcript viewer** (Dashboard, English, not a Dashboard assistant): paginated list with language/date/outcome filters and search, empty/loading/error states; detail with the visitor/assistant turns, outcome and source links; deliberate delete confirmation ("this deletes the whole conversation permanently"); a settings panel with the on/off switch and retention (`manual` or N days) plus the privacy/retention explanation above; a small usage panel (questions, unanswered, provider calls vs cap, cost 0).


## Design Lab approval — 24 Sep 2026

The owner approved the Assistant Design Lab
(https://claude.ai/artifact/PJvFJ8hXmoZnwooMJxLzd5) with every recommendation:
the public widget keeps today's look and **changes its notice** from “nobody
reads along” to the new wording (answers come from the website; conversations
are saved so Yaman can improve the site; privacy link) — an approved visible
change, applied when the widget moves to V2 at the public cutover; the private
conversation page gets **its own “Assistant” menu item**; retention defaults
to **until the owner deletes**, with the automatic-deletion option and the
privacy warning shown beside it.
