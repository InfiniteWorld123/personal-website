# Inbox V2 — product, backend, and frontend plan

Status: **Inbox V2 has been live since the owner-approved cutover on 24 Sep
2026. Reliability repairs, Compact workspace, bulk management and intent
prefetch are approved and implemented on 2 Oct 2026.** Dated delivery records
below own current behavior. Older implementation and planning notes are retained
as history; where they conflict, the later dated decision wins. This document
does not authorize unrelated changes to public pages, authentication or email
routing.

## What is built — Backend2, 23 Sep 2026

### Reliability fixes approved 2 Oct 2026

The owner requested implementation, testing, GitHub publication and Cloudflare
deployment of the Inbox review findings. This is a bounded repair of the current
mailbox. The later owner request below extends it with bulk management and an
Outlook-style redesign.

- Draft saves publish the returned revision to the query cache and refresh the
  paginated draft list/counts. Closed drafts are read fresh when reopened. Closing
  after a failed save keeps the editor and local recovery text visible. A completed
  older autosave does not clear text typed while it was in flight.
- Formatting buttons preserve the mouse selection and also activate through
  keyboard clicks. Email content fills its field, with one focus outline around
  the field. The mobile settings icon retains an accessible name.
- The email link button uses the existing Dashboard dialog style and TanStack
  Form validation instead of native prompt/alert. It preserves the selection,
  supports display text and HTTPS defaults for bare domains, and rejects unsafe
  protocols and relative paths. Errors appear after submit and while correcting.
- Sending distinguishes confirmed acceptance, failed attempts, active requests,
  and **unknown outcomes**. Network timeouts/errors, provider 5xx/409 and successful
  responses without a confirmation ID are unknown. Existing DB `sending` rows with
  a failure reason or an attempt older than two minutes expose API status `unknown`;
  no database migration is needed. The list shows “Needs attention”.
- Retry reuses the message ID and is allowed only for **23 hours 55 minutes from
  immutable message creation**, before the first provider call. The five-minute
  margin fits inside [Resend's documented 24-hour retention](https://resend.com/docs/dashboard/emails/idempotency-keys).
  Last-attempt time never extends that window. Expired attempts keep their content,
  disable Retry on the server and screen, and explain that the owner must check the
  provider before composing another email. Accepted messages cannot send again.
- Conversations poll every five seconds while an active `sending` message exists,
  then stop once the result or interrupted state becomes visible.

Verification covers the API using a throwaway PostgreSQL and fake provider calls,
mocked provider HTTP outcomes, draft save/close/reopen and offline recovery, keyboard
button activation, link validation, and unknown/expired delivery UI. Actual sending
and external recipient delivery require a separately identified test recipient;
this repair does not prove a real email round trip.

### Bulk management and Outlook-style experience — owner request, 2 Oct 2026

The owner explicitly requested completion of the previously excluded real-send
test, bulk management and redesign, plus GitHub publication and deployment.

- Bulk management acts on explicitly selected conversations, with Select all
  limited to the current server-paginated page. It never silently selects other
  pages or every search result. Selection clears on folder/filter/search/page
  change; background refresh retains only IDs still present on that page.
- Reversible actions: read/unread, star/unstar, archive/move to Inbox, Trash and
  Restore. Trash moves the whole thread and keeps its original folder; restore
  returns each thread to its own previous folder. Existing explicit permanent
  deletion confirmations remain. Bulk sending is outside this request.
- `POST /api/v2/owner/inbox/conversations/bulk` is owner-authenticated and
  no-store, accepts 1–100 UUIDs and one allowlisted action, deduplicates IDs and
  locks in deterministic order. It changes all selected threads in one
  transaction, or changes nothing if any ID is missing or an archive action
  includes Trash. Repeated actions are idempotent and do not send mail, delete
  attachments or change message contents. No database migration is needed.
- Backend is implemented and tested before frontend work. An isolated interactive
  Design Lab uses labelled fictional mail, desktop/mobile views, clear selection,
  compact command bar, calm editor and an Outlook-like folder/list/reading flow
  within the existing dashboard brand. The owner explicitly approved the rendered
  **Compact workspace** on 2 Oct 2026; the approval and implementation are recorded below.
- The owner supplied a recipient in the private conversation. One short
  labelled real test message is authorized. Provider
  acceptance and observed recipient delivery are recorded separately. No real
  address or private message content belongs in this specification or fixtures.
- Additional owner request: improve perceived speed with conversation/folder data
  prefetch on hover and keyboard focus, plus editor code loading on intent, bounded fresh-cache reuse, cancellation
  and deduplication of unnecessary requests, while preserving fresh saves,
  delivery polling, failure feedback and accurate unread counts. Prefetch only
  reads; it must never mark mail read, create drafts or send anything.
- Handoff: inspect this scope and current code; verify the bounded authenticated
  atomic backend with fake sends and throwaway PostgreSQL; present and verify the
  interactive lab on desktop/mobile; obtain visual approval; connect and test the
  approved frontend; complete the identified real-email test; run typecheck,
  relevant tests, build and browser QA; commit only this scope on `main`, push and
  await the exact GitHub Deploy workflow, then verify the published UI.

#### Local backend and lab checkpoint — 2 Oct 2026, before visual approval

- The bulk backend is implemented. Its eight new integration cases passed with
  the existing Inbox cases (71), covering exact selection, duplicate IDs,
  folder restoration, repeat actions, untouched messages/drafts, rollback,
  bounded validation and session/non-local denial. All mail transport is fake.
- Conversation and folder hover/focus prefetch uses the same query options as
  opening. Mouse intent waits 120 ms; leaving cancels the pending timer. Fresh
  data is reused for 20 seconds, in-flight requests are deduplicated, abort
  signals reach fetch, and data-saver/2G disables speculative reads. Prefetch
  never marks a conversation read. Opening still does so explicitly.
- Read/star/archive flag updates merge the server-confirmed summary into cached
  history and refresh list/counts, instead of downloading all message pages
  again. Draft reads stay fresh on reopening; no speculative draft snapshot
  replaces that reliability rule. The composer shows its saved check only when
  current text is actually saved.
- The isolated lab compares **Mailbox** (recommended: folder column, list,
  reading pane and contextual bulk command bar) with **Compact workspace**
  (folder tabs leave more reading space). Both retain dashboard blue, dark/light
  surfaces and Space Grotesk/Fraunces typography. On phones both use a list-to-
  message flow, wrapping folder choices and commands. Borders separate structure;
  the editor is calm and does not display a blue frame while idle.
- The lab contains fictional example.com mail only, no auth/API/provider calls.
  Browser verification covered two selected threads moving to Archived,
  paginated lists, mobile compose/link validation, a saved mock draft appearing
  in Drafts and desktop/mobile rendering. It is a prototype, not proof of
  connected production frontend or actual email delivery.
- At this checkpoint the visual choice, connected frontend and recipient were
  pending. The subsequent approval and connected verification below resolve
  these; independent external receipt remains separate from provider acceptance.
- Final local checks: typecheck, Cloudflare build, 81 test files / 1479 tests
  passed. An unrelated Calendar form wait timed out while build and tests were
  competing for resources; the isolated 14 Calendar form cases and the full
  suite then passed with the build completed. No Calendar code was changed.
- Actual runtime: the same owner bulk routes were exercised over HTTP and the
  real `pg` socket protocol against new in-memory PostgreSQL: selected archive,
  Trash/restore to original folders, missing-ID rollback, unread counts and
  unauthenticated denial passed. The temporary fixture server/database were
  stopped afterwards; the owner's database and real mail provider were unused.

#### Visual approval — 2 Oct 2026

The owner explicitly chose **Compact workspace** and supplied a recipient for
the real email test. Implement the approved folder tabs across the mailbox,
compact command bar, paginated selectable list beside the reading pane on wide
screens, navigable list/message flow on phones, flat chronological letters and
calm writing surface. Preserve the existing validated compose/reply/draft,
attachment and delivery-recovery behavior. One clearly labelled real test email
is authorized. Keep the recipient address in the private conversation only.
Publication and deployment were already requested; no further Git approval is
required once connected checks pass.

#### Connected Compact workspace verification — 2 Oct 2026

- The approved full-width folder tabs and contextual command bar surround a
  320 px selectable list and flat chronological reading pane. A container query
  keeps both panes visible when the mailbox itself has at least 800 px; phones
  navigate between list and message. Checkbox selection never opens a message,
  is explicitly page-limited and cannot act on a placeholder page, an error or
  an in-flight bulk command. Refresh prunes missing IDs; page removal returns
  to the last valid page. Search follows address/Back navigation.
- Bulk errors retain available selection and explain an unconfirmed update.
  Selected open mail closes after folder moves or an unread command. Automatic
  read happens once on first load, so an explicit unread command stays unread.
  Confirmed summary patches reuse history; bulk invalidation is limited to
  lists/counts/drafts and the selected histories, never unsaved draft revisions.
- The Inbox route, reader, composer and settings have separate production
  chunks. Intent loads reader code and paginated history together; opening a
  reply loads editor code alongside draft creation. Reading without a reply
  does not require the editor or Media picker. Drafts still load their current
  server revision when opened, rather than trusting a speculative snapshot.
- Composer submission disables its controls and editing while pending, including
  the confirmed blank-subject path, and blocks repeated sends. The saved check
  appears only when current text is saved. Link validation and the single
  accessible editor focus ring remain intact.
- The owner's Chrome verified the connected app against a new throwaway
  PostgreSQL with 28 fictional letters and fake transport: selecting two,
  archive, Trash, restoring both to Archived, second-page selection and marking
  read, preserving an explicit unread command, invalid/safe link entry, draft
  close/reopen and fake send, reply save/close/reopen. Desktop 1440 px and phone
  390 px rendering passed; no horizontal page overflow. Temporary servers and
  their browser tab were closed after testing. No owner mail was changed.
- Full automated suite: 83 files / 1490 tests passed. The added UI cases cover
  exact selected IDs, scope changes, stale pages, refresh, pending and uncertain
  bulk updates, restore, explicit unread and blank-subject pending protection.
  Typecheck, relevant UI tests and the Cloudflare build verify the final chunks.
- GitHub publication and Cloudflare rollout are explicitly requested. Verify
  the Deploy workflow for the exact pushed commit, then test the published
  mailbox and send the one labelled real email. Record actual provider outcome
  and independent recipient receipt separately in the private handoff.

Verified with `src/tests/backend2-inbox.test.ts` (44 tests against a real in-process PostgreSQL) and a runtime check over a real `pg` socket to a throwaway database. Nothing was sent by email, nothing touched the owner's Neon database, and no routing or Worker changed.

- **Migration `0009_inbox.sql`** (0008 was taken by Clients). Tables: conversations, messages, incoming attachments, drafts, signatures, ready replies. It also adds `inbox` to the Media references module list — a later migration that restates that list must keep it. **Not applied to Neon**; that is a cloud change and waits for the owner's yes.
- **Routes** under `/api/v2/owner/inbox/…` as proposed, plus `GET /counts`, `GET /messages/:id/html`, `POST /messages/:id/retry` and paginated `…/snippets`. All behind `ownerGuard`, `no-store`, 404 from any non-local host.
- **Sending is fake unless `INBOX_SEND_MODE=live`.** The development `.env` already holds a working Resend key for the legacy site, so "send when a key exists" would have made the first local test a real email. A fake send is recorded with provider `fake` and the Dashboard says so. In production without the opt-in, sending fails honestly instead of pretending.
- **Send is idempotent twice over.** The draft becomes a `sending` message in one transaction under a unique `source_draft_id`, so a double-click finds the same message; the provider is then called with the message id as Resend's `Idempotency-Key`, so a retry after a timeout cannot deliver twice. A provider failure answers `409 SEND_FAILED` with the conversation and message ids; the message keeps its text and files and offers Retry.
- **Threading.** Outgoing mail carries `From: Yaman Warda <info@yamanwarda.de>`, our own `Message-ID`, `In-Reply-To`/`References` for replies, and `Reply-To: reply+<32 hex>@yamanwarda.de`. An arriving letter joins a conversation only by that token or by a Message-ID we hold; never by sender or subject. Anything else starts a new conversation. A reply to an archived or trashed conversation returns it to the Inbox, unread. Our own Message-ID arriving back is ignored, so nothing loops.
- **Ingress** `POST /api/v2/inbound-email`: mounted only where a V2 database exists, off unless `INBOX_INGRESS_SECRET` (32+ characters) is set, HMAC-SHA-256 over `<unix seconds>.<raw body>` in `x-inbox-signature` / `x-inbox-timestamp`, five-minute window, 30 MB body, deduplicated by Message-ID (or a content hash without one). `src/start.ts` exempts this one path from the Origin check, as it already does for the legacy ingress. The payload shape is the current Worker's plus `references`.
- **Incoming files** are stored privately under `inbox/…` in the Media store, never in the library. Programs, scripts, web pages and macro-enabled Office files are **blocked and not kept** (the email is); files over 10 MB are recorded as failed. A file the server cannot identify but that cannot run (a calendar invite) is kept for download only. Downloads are always `attachment`, `nosniff`, sandbox CSP. **Save to Media** re-runs the ordinary Media upload, so it cannot add anything an upload could not; a second save returns the first copy; deleting the conversation leaves the copy.
- **Incoming HTML** is stored and returned only as data for a sandboxed view that loads no remote content. The list and the default view use the plain text.
- **Outgoing files** come only from Media. A draft's files are `draft`-scope references and a sent message's are `record`-scope references, so Media refuses to delete them; permanent deletion of the conversation releases the use and never deletes the shared file.

### Open decisions

- **Malware scanning for Save to Media — decided 23 Sep 2026: no scanning.** Save to Media stays an explicit owner action on one file at a time; the server proves the type from the bytes, blocks anything that can run, and the owner decides the rest.
- **Before live use:** superseded by "Going live" below (owner decision, 24 Sep 2026: the Inbox goes live with the public cutover).

### Going live — 24 Sep 2026

Owner decision: every email to `info@yamanwarda.de` arrives in the Dashboard Inbox with its attachments, replies from the Dashboard go out through Resend (`yamanwarda.de` verified, eu-west-1), and the owner keeps receiving a copy in Gmail exactly as today. Invoices stay in test mode.

**Done in the repository (not deployed):**

- **The inbound Worker** (`workers/inbound-email`) now does, per letter, in this order: reads the bytes; **forwards the copy to `FORWARD_COPY_TO` first** (unchanged address, before any parsing, so a crash or CPU limit on a huge letter cannot cost the Gmail copy); parses; posts to `INBOX_V2_ENDPOINT` signed with `INBOX_INGRESS_SECRET` (`x-inbox-timestamp`, `x-inbox-signature` = HMAC over `<seconds>.<body>`), with `inReplyTo` **and `references`**, the header sender (not the envelope bounce address), and the files as base64. A 5xx, 408, 429 or network error is retried twice (after 1 s and 4 s, fresh timestamp each time; the Inbox deduplicates by Message-ID); a 4xx is not. The legacy post to `/api/inbound-email` still runs while `INBOUND_ENDPOINT` + `INBOUND_MAIL_SECRET` are set — delete the var to stop it. **A letter is refused only when nobody took it** (no forward and neither inbox accepted); a forwarded letter is never refused. Logs carry statuses and counts only. The logic is in `deliver.ts` so it is testable without Cloudflare.
- **Limits.** Every field is clamped to the ingress schema (text and HTML 1,000,000 characters, subject 2,000, References cut to the newest ids within 20,000, at most 30 files) so a strange letter is never refused whole. Files are packed into what the rest of the letter leaves of the 30 MB body; one over 10 MB, or one that does not fit, is sent as an **`omittedFiles`** note (name, type, size) and shown in the conversation as a failed file that "the copy forwarded to your mailbox has". Email Routing's own ceiling is 25 MiB per message.
- **Backend2:** the ingress accepts `omittedFiles` and records each as a failed attachment. Nothing else changed.
- **Tests:** `src/tests/inbound-worker.test.ts` (order, signature, retries, never-refuse-after-forward, legacy switch, clamps, packing) and one end-to-end case in `backend2-inbox.test.ts` that runs the Worker's `deliver` against the real ingress route (threading by `References` alone, a stored PDF, a named 11 MB file).

**Still to do, by the owner/operator, in this order:** migrations on Neon (including `0009`) → `INBOX_INGRESS_SECRET` (new random, 32+ characters) as a secret on the `yamanwarda` Worker, `RESEND_API_KEY` present there, `INBOX_SEND_MODE=live` in its vars → deploy the site and check that an unsigned `POST /api/v2/inbound-email` answers **401** (503 = secret missing, 404 = V2 database not configured, 403 = old code) → the same `INBOX_INGRESS_SECRET` on `yamanwarda-inbound-email` → deploy that Worker (`npx wrangler deploy -c workers/inbound-email/wrangler.jsonc`) → Email Routing: `info@` and `reply@` routed to that Worker (not straight to Gmail), Subaddressing on, `FORWARD_COPY_TO` a verified destination → a real round trip: a letter with a PDF from an outside address, a Dashboard reply, the answer to `reply+…@`, and an answer sent to `info@` (threads only if Resend keeps our `Message-ID`). Deploying the Worker before the site is safe: the old site answers 403, the Worker does not retry a 4xx, and the letter is still forwarded and posted to the legacy inbox — only the V2 copy of those letters is missing.

### Dashboard screens — built 23 Sep 2026

`/dashboard/inbox`, as approved: list and conversation side by side from 1280 px wide, one after the other below that (phone and small laptop); folders as tabs with counts (Inbox, Sent, Drafts, Archived, Trash); search, All / Unread / Starred, pages of 25; the unread count beside **Inbox** in the sidebar. A conversation reads oldest to newest in pages of 20 with "Show earlier messages"; Reply opens under the thread and recovers an existing reply draft. The composer saves itself (Saving… / Saved / Couldn't save + Retry, and a copy in the browser for a closed tab), offers a choice when another window saved first, keeps Send off until the draft is saved, asks before a blank subject, and attaches only from the Media picker. Signatures and ready replies sit behind **Signatures & replies**. Files from strangers: Download, Save to Media on one click, blocked files shown as blocked. The formatted version of an email opens in a sandboxed frame that loads no remote images. Trash has Restore, Delete forever and **Empty Trash** after typing `EMPTY TRASH`. All forms use TanStack Form with check-on-submit, then on change.

Verified in a browser against a throwaway database (never Neon), desktop and phone: list, counts, opening marks read, Save to Media, the blocked file, the sandboxed formatting, reply with autosave and send, a new message's validation and focus, the blank-subject question, a failed send retried, Trash and Empty Trash, and Arabic right to left. `src/tests/inbox-calendar-ui.test.tsx` covers the conversation screen.

### Design Lab — approved 23 Sep 2026 (`1A 2A 3A 4A 5A 6A 7A`)

`https://claude.ai/artifact/T7ATpq64EJYdFhWAHZBdbE` — private to the owner. Sample mail only. Seven choices, recommendation `A` for each: layout (list + reading pane, folders as tabs), chat-like reading order with paged history, inline reply, new message in the reading area, signatures and ready replies inside Inbox, unread count beside Inbox in the sidebar, plain text first with "View original formatting".

## Owner communication — mandatory

Use very simple Arabic with the owner, even when the owner writes English, in
natural right-to-left Arabic prose.
Explain any necessary technical word in the same sentence, lead with what
happened and whether the owner needs to act, and distinguish local work from a
later public release. Keep English identifiers in backticks, avoid unnecessary
internal detail, and ask small batches of material questions while saying how
many remain. The complete rule is in `AGENTS.md`.

## Purpose and boundaries

Build a compact, real, single-owner mailbox at `/dashboard/inbox` for `info@yamanwarda.de`. It receives all mail addressed to that address, not only website contact submissions, and can compose and reply to one person at a time. The V2 mailbox starts empty; legacy messages are not imported. Keep `/admin/inbox`, the legacy database, and current mail delivery working until a separately approved and verified cutover.

Inbox is not the Leads CRM, a marketing campaign tool, a booking system, or invoice generation. It must not create Leads or Clients automatically or require those records to send or receive mail. Future links to those modules must be separately planned and must not make ordinary correspondence depend on them. Bulk sending, multiple recipients, CC/BCC, campaigns, SMS, external notifications, read receipts, and tracking pixels are outside this MVP.

## Public contact form handoff

- At V2 public-form integration, **remove the entire “What is it about?” and “Budget range” select controls from the public Contact frontend only**. Do not merely hide them while still requiring/submitting their values, replace them with another classification question, infer a budget/service, or show empty facts in a Contact-origin Inbox conversation. This is an explicit owner-approved visible change to Contact; preserve its other accepted content and design. **Do not remove these optional controls from the public Booking form.**
- If the visitor includes a file through the public contact form, show it as a **private incoming attachment** in that same conversation. The owner can safely download it and, when the type is supported, explicitly **Save to Media**; it must not become public or appear in Media automatically. The V2 public form accepts one file of at most **10 MB**, limited to PDF, photos/images, video, and Word/Excel/PowerPoint documents. This supersedes the earlier idea of arbitrary files or code such as Python; do not accept every type or executable files. Define and verify the concrete extension/MIME/signature allowlist on the server, keep unsafe types out, and present a clear file-size/type error. This is a planned change at approved V2 cutover, not permission to change the live form now. A video over 10 MB cannot be sent through this form.
- At V2 cutover, choose one authoritative ingestion path for each contact submission and test that it creates exactly one conversation. The legacy contact path currently writes to Leads and can send an owner notification, so do not blindly run that path alongside a new Inbox insert or route a notification back into `info@` as a duplicate conversation. Keep the current public submission working until the separately approved cutover.

## Booking handoff (planned, not part of Inbox-only implementation)

- The owner wants each confirmed appointment associated with an Inbox conversation that supports email replies. The public Booking form **keeps its optional “What is it about?” and “Budget range” controls**; when answered, their values can appear in that booking's Inbox conversation. Their removal from Contact does not change Booking. The appointment itself remains owned by the Booking/Calendar module; Inbox is the correspondence surface, not the booking database or Leads CRM. The Booking specification will define the exact creation, confirmation-email, and reply-thread flow. Avoid duplicate conversations or notification loops when the two modules are connected.

## Email transport and identity

- Use the existing **Cloudflare Email Routing → inbound Worker** direction for receiving and **Resend** for outgoing mail. `info@yamanwarda.de` is an address routed by Cloudflare, not a password-protected IMAP/Gmail mailbox. Backend2 owns a separate mail adapter and inbox records; it must not import the legacy backend merely because the current implementation is useful evidence.
- Show `info@yamanwarda.de` as the sender. Replies must arrive back in V2 and attach to the right conversation. Inspect the current routing, subaddressing, signed ingress, `Message-ID`/`In-Reply-To`/`References` behavior, sender-domain verification, and deployed Worker state before choosing the final mechanism. Do not assume a repository file proves that live routing works.
- Record an outgoing message as **sending**, **accepted by provider**, or **failed/needs attention** accurately. Provider acceptance is not proof that the recipient read or received it. On failure, retain the composed text and attachments for retry. Use idempotency/deduplication so a double-click, webhook retry, or network timeout does not create duplicate messages or silently send twice.
- Incoming mail is accepted only through a trusted Worker-to-Backend2 path with request authentication, bounded payloads, replay/deduplication protection, and clear failures. Never expose an unauthenticated owner mailbox API. Keep secrets and full private message bodies out of logs.
- During development, test with safe fixtures and fake sending. A production change to routing or sender configuration requires separate approval, a real send-and-reply round trip, monitoring, and a rollback/forwarding plan. Do not reroute `info@` during ordinary module implementation.

## Conversations and lifecycle

- A **conversation** starts with one new incoming or outgoing email and contains its replies. A separate new email from the same person—even with a similar subject—starts a separate conversation. Inside a conversation the reading experience may feel chat-like, but retain normal email details such as subject, sender, recipients, timestamp, and attachments. Do not group all mail from one person as the legacy Inbox does.
- Match replies using trustworthy message/thread headers and, if needed, a controlled reply address/token. Sender address or subject text alone is not enough to merge conversations. Deduplicate the same inbound message and handle missing or malformed threading headers safely as a new conversation rather than attaching it to the wrong client.
- The main Inbox shows active conversations. Support unread/read, star/unstar, archive/unarchive, search, and Trash. Archived conversations disappear from the main Inbox but have an obvious **Archived** entry inside Inbox navigation; they are not reachable only by typing a URL. No Spam folder/UI in this MVP. Basic inbound abuse and unsafe-content handling still apply; do not silently lose legitimate mail.
- Moving a conversation to Trash moves its entire reply thread. Trash has a visible route, restore action, permanent delete for one conversation, and **Empty Trash** for all. Permanent actions require explicit danger confirmation and explain that messages and Inbox-owned attachments cannot be restored. There is no automatic expiry or auto-empty in this MVP. Shared Media assets are not deleted merely because an Inbox conversation is deleted.
- A new valid reply to an archived or trashed conversation returns it to the active Inbox and marks it unread, so a client answer is not hidden. A reply after permanent deletion starts a new conversation if it cannot safely match an existing one.
- Dashboard notification in the MVP is an unread count and a new-mail indicator inside Dashboard. No browser push, personal-email notification, or SMS yet. Do not send a notification to `info@` that loops into the same Inbox.

## Compose, drafts, and settings

- New compose has one `To` address, subject, and a safe rich-text body with a plain-text equivalent for email clients that do not render HTML. Reply uses the conversation context. A blank subject may be sent only after a clear warning/confirmation; a blank body cannot be sent. No arbitrary HTML/scripts or unsafe pasted embeds.
- New-message and reply **drafts autosave privately** while editing, with visible saving/saved/failed states and recovery after navigation or browser restart. Autosave never sends an email. A failed save keeps the local text and offers retry; sending is an explicit separate action, disabled while validation or attachment transfer is incomplete. Draft lists are server-paginated.
- Provide editable signatures for DE, EN, and AR and reusable ready replies/snippets. The owner chooses the language for a draft; do not translate or send text automatically. Applying a snippet or signature is visible and editable before sending. Settings and snippet lists use bounded pagination where they are independently browsable.
- Show sending progress, provider failure, sent/accepted status, and retry without falsely displaying success. Prevent duplicate submissions. The owner can always inspect a sent message in its conversation.

## Attachments and shared Media

- Outgoing attachments are chosen **only** through the shared Media picker. If the desired file is on the owner's computer, the picker first uploads it to `/dashboard/media`, then selects it for the email. Do not add an Inbox-only owner upload path or copy the file into a second module store. A draft or retained sent message referencing a Media asset blocks that asset's deletion according to `media.md`.
- An attachment arriving with an email is different: it was not uploaded by the owner. Store it privately as part of the received Inbox message and show a safe private download action. It does **not** appear in shared Media automatically. An explicit **Save to Media** action copies a supported attachment into the owner's library; deleting/trashing the conversation later does not automatically delete that saved Media copy.
- ~~The owner would prefer Media to support modern Word, Excel, and PowerPoint files as private downloadable assets.~~ **Done, 22 Sep 2026.** The shared library now accepts Word, Excel and PowerPoint — both the modern `.docx`/`.xlsx`/`.pptx` and the older `.doc`/`.xls`/`.ppt` — along with OpenDocument, RTF, plain text, Markdown, CSV and ZIP, beside the images, video and PDF it already took. So **Save to Media** is available for those types and the Inbox no longer needs to explain an absence. The authoritative list is `ACCEPTED_TYPES` in `src/backend2/contracts/media.contract.ts`; read it rather than restating it here, because it will keep changing.
- The fallback rule still stands for anything outside that list: allow the private download to the owner's computer and say plainly why **Save to Media** is unavailable, rather than failing silently.
- Media already honours the rest of this paragraph, and the Inbox must not undo it. Every document type is served with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` — downloaded, never opened in the browser, never sniffed into something else. Do not claim Office files have a safe in-browser preview, execute macros, or inline untrusted file content.
- One thing the type check cannot do, worth knowing before **Save to Media** ships: it proves a file *is* a real Word document, not that the document is harmless. Today every file in the library came off the owner's own computer. Incoming email attachments are the first files from strangers, so whether saving one needs malware scanning is a decision to make with the owner at that point — not an assumption either way.
- Verify actual payload, type, size, filename, and provider/runtime limits rather than trusting extensions or email headers. Unsupported/dangerous files must not execute in a browser. Do not silently discard an entire message because one attachment failed; preserve the message and show the attachment's failure where possible. Public routes must never serve private Inbox attachments merely because the same library can also contain public-site images.

## Dashboard experience for Design Lab

- Use the accepted English-only Dashboard V2 visual system. On desktop, present a clear conversation list and reading/composer area; on mobile, use a navigable list-to-conversation flow rather than squeezing two panes. Show one conversation with chronological messages, subject/email metadata, attachments, reply composer, and explicit status/actions.
- Provide visible Inbox, Archived, Trash, Drafts, and Sent entry points; unread/starred filters and search can live in the list. The archive entry may be visually secondary but not hidden. Show counts, empty/loading/error states, failed autosave, failed send, attachment failure, and the irreversible empty-trash confirmation.
- The Design Lab should compare a few deliberate layouts and recommend one, including desktop/mobile interaction, keyboard focus, accessible status feedback, and how a long thread paginates. It should use sample mail only, not actual private messages or provider calls. The owner must approve rendered design before production frontend is built.

## Proposed Backend2 data and API surface

Use the V2 database and `/api/v2` transition namespace. The precise table shape and transport details are engineering choices to document after code inspection; the behavioral contract is: independent conversations, ordered messages, private drafts, message IDs/thread references, send attempts/status, per-conversation read/star/archive/trash state, Inbox-owned incoming attachments, Media references for outgoing attachments, and multilingual signature/snippet settings. Search and every browsable list use bounded server-side pagination with deterministic order. A long conversation fetches bounded message pages, not its entire history at once.

| Method | Proposed route | Purpose |
| --- | --- | --- |
| GET | `/api/v2/owner/inbox/conversations` | Paginated folder/filter/search list and counts |
| GET | `/api/v2/owner/inbox/conversations/:id` | Conversation summary and paginated message window |
| PATCH | `/api/v2/owner/inbox/conversations/:id` | Read/unread, star/unstar, archive/unarchive |
| POST | `/api/v2/owner/inbox/conversations/:id/trash` | Move entire thread to Trash |
| POST | `/api/v2/owner/inbox/conversations/:id/restore` | Restore from Trash |
| DELETE | `/api/v2/owner/inbox/conversations/:id` | Confirmed permanent delete of a trashed thread |
| POST | `/api/v2/owner/inbox/trash/empty` | Confirmed bulk permanent delete |
| GET / POST | `/api/v2/owner/inbox/drafts` | Paginated drafts and creation |
| GET / PATCH / DELETE | `/api/v2/owner/inbox/drafts/:id` | Read, autosave, discard draft |
| POST | `/api/v2/owner/inbox/drafts/:id/send` | Explicit one-recipient send or reply, idempotent |
| GET | `/api/v2/owner/inbox/attachments/:id` | Owner-only incoming-attachment download |
| POST | `/api/v2/owner/inbox/attachments/:id/save-to-media` | Explicit, supported-type copy into shared Media |
| GET / PUT | `/api/v2/owner/inbox/settings` | Signatures and ready replies |
| POST | `/api/v2/inbound-email` | Authenticated machine-to-machine Cloudflare ingress; not a visitor API |

Owner endpoints require verified V2 authentication. If Auth is not yet fully connected, owner routes must remain unavailable outside verified local development; do not rely on a hidden Dashboard page or branch name. The inbound Worker has its own narrowly scoped authentication. Return safe, stable error codes for forbidden access, missing conversation, invalid address/body, provider failure, oversized/unsupported attachment, stale draft update, and duplicate/replayed ingress. Do not expose private addresses, message bodies, filenames, storage keys, or raw HTML through public endpoints. Review privacy retention and backup access before production use.

## Verification, dependency, and cutover checks

- Test a first incoming email, an outgoing new email, a reply in each direction, two separate subjects from the same person, missing headers, duplicate delivery, archived/trashed reply reopening, unread/star controls, search/pagination, drafts and autosave conflict/failure recovery, signed-ingress denial/replay, provider failure/timeout, and no accidental send on autosave.
- Test single-conversation Trash/restore/permanent delete and Empty Trash confirmation; no deletion of referenced shared Media. Test incoming private attachment download, Save to Media for a supported type — Office is one, since 22 Sep 2026 — the fallback download for a type the library does not accept, owner-only protection, unsafe-file handling, and public non-disclosure.
- At the separately approved public-form integration, browser-test Contact in all public languages and screen sizes to confirm both removed select controls are absent from its UI, submissions, server requirements, and newly created Contact-origin Inbox conversations. Verify that Booking still displays and accepts these optional controls and includes answered values in its own Inbox conversation. Test the one-file/10 MB Contact limit and accepted versus rejected file types, while preserving the remaining form experience.
- Verify actual current Cloudflare routing, Worker deployment, Resend sender configuration, and end-to-end delivery **before** any later live cutover. A local fake-send or passing backend test is not proof that `info@` can receive/reply in production. Preserve and test a fallback route before changing DNS/routing. No old-message import or legacy database write.
- Run typecheck, relevant automated tests, build, and local runtime checks after backend work; after design approval, browser-test the connected UI on desktop/mobile and report exactly what was verified versus untested. Keep unrelated changes out of the module diff. Commit/push to `main-v2` only on the owner's explicit Git request; no deployment or production mail-routing change is implied.

## Handoff prompt for Claude — execute on the owner's read-to-build request

> This is an implementation request, not a request for a summary. Read `AGENTS.md`, `docs/v2/foundation.md`, this entire `docs/v2/inbox.md`, and the relevant Auth and Media specifications. Inspect the current V2 backend, V2 dashboard, legacy Inbox/Cloudflare inbound Worker/Resend integrations as evidence, and the working tree for concurrent work. Do not import legacy inbox code or data into Backend2, silently change existing email routing, or overwrite the in-progress Media module. V2 Inbox starts with no legacy messages, receives all `info@yamanwarda.de` mail, sends through Resend, and keeps separate conversations per initial email with replies inside them. Preserve `/admin` and the current public site until its separately approved V2 integration. At that integration, remove the two public Contact select controls described above completely, but **retain them in Booking**; do not silently change the live forms as a side effect of Inbox backend work.
>
> Before backend work, ask the owner only about a genuinely material unanswered backend decision. Otherwise implement and fully verify the Backend2 Inbox contracts, migrations, private conversation/draft/settings APIs, signed Cloudflare ingress integration, idempotent Resend send path, Media references for outgoing attachments, private incoming attachments with supported Save to Media, Trash/archive behavior, pagination, security, and failure states. If the current Media module does not yet support Office files, keep private Inbox downloads working and report that gap rather than expanding Media silently. Use fake provider calls and safe fixtures locally; do not send real mail or reconfigure live routing without separate approval. Report backend tests and runtime evidence before moving on.
>
> After backend verification, ask the owner only about material frontend/UX questions still unanswered. Then use the `frontend-design` skill to build an isolated interactive Inbox Design Lab with sample data, rendered desktop/mobile states, recommendations, and tradeoffs. Show Inbox, one conversation, compose/reply, autosave failures, Archived, Trash, Sent, attachments, and pagination. Wait for explicit visual approval before implementing production frontend. Then connect the approved UI to the verified backend with TanStack Form where applicable, test connected flows, review the exact diff and staged files, and commit/push only if the owner requests that Git action, to `main-v2`. Do not deploy, cut over mail routing, or build Leads/marketing as part of this module.

## Public Contact endpoint — backend record

Built 23 Sep 2026 on `main-v2`, backend only. The live Contact form still posts to the legacy `/api/contact`; switching it is the separately approved public cutover, which will also remove the two select controls from the Contact UI.

- **Route.** `POST /api/v2/public/contact`, `multipart/form-data`, mounted only where the V2 database is configured. Code: `src/backend2/modules/inbox/contact.public.route.ts` (thin), `contact.service.ts`, contract `src/backend2/contracts/contact.contract.ts`, tests `src/tests/backend2-contact.test.ts`. No migration: it uses the existing `origin = 'contact'` / `origin_ref` columns from 0009.
- **Fields.** `submissionId` (UUID), `name` (1–120), `email` (≤254, lower-cased), `message` (10–5000), `language` (`de`/`en`/`ar`), optional `phone` (≤40) and `company` (≤200) because the current form has them, `turnstileToken`, honeypot `hp_x9` (renamed from `website` on 30 Sep 2026 because browser autofill filled it and a real message was dropped), and one optional file in `attachment`. Any other field — including the removed "What is it about?" and "Budget range" (`projectType`, `budget`) — is ignored and never stored. Validation errors are `422 VALIDATION_ERROR` with `details.issues[].field`.
- **Result.** Always `201 { received: true }` with `no-store`: for a new submission, a repeat, and a filled honeypot (which stores nothing). No id or private data is returned.
- **What it writes.** One unread conversation: origin `contact`, `origin_ref` = `submissionId`, counterpart = visitor, subject `Website contact — <name>`, a normal reply token so the owner answers from Inbox. One incoming message: the visitor's text, then `Phone:` / `Company:` lines when given; the message's `language` is the page language; `facts` stays empty.
- **Exactly once.** The message's unique `dedupe_key` is `contact:<submissionId>`, the write runs under a transaction advisory lock on that key, and the unique index settles any remaining race. A repeat is recognised before the Turnstile check, because a Turnstile token works only once.
- **File.** At most one, ≤10 MB (`413 FILE_TOO_LARGE`), whole body ≤11 MB counted while reading (`413 BODY_TOO_LARGE`). The type is decided from the bytes only: PDF; JPEG, PNG, WebP, GIF, HEIC/HEIF, AVIF; MP4, MOV, WebM; DOCX/XLSX/PPTX (OOXML ZIP with `[Content_Types].xml`); DOC/XLS/PPT (OLE2 with the matching stream name). Everything else — programs, scripts, HTML, SVG, ZIP, text, OLE2 without an Office stream, and Office files with macros — is `422 UNSUPPORTED_FILE_TYPE` with `details { field, maxBytes, allowed, extensions }`. A name that disagrees with the bytes gets the real extension appended (`offer.exe` → `offer.exe.pdf`). Stored privately exactly like an email attachment (pending ledger, `inbox/…` key); never public, never added to Media automatically. If storage is unavailable the submission fails with `503 STORAGE_UNAVAILABLE` and nothing is written, so the visitor can retry — unlike email, the sender is still on the page.
- **Anti-abuse.** Turnstile via the shared `verifyHuman` (required wherever `TURNSTILE_SECRET_KEY` is set; refuses to run in production without it; skipped in local development without a secret). Rate limits: 5 per hour per source address, 3 per hour per email address (`429 RATE_LIMITED`). The global Origin check in `src/start.ts` applies as to every `/api` mutation.
- **No owner notification email** (decision). The unread count in Inbox is the notification. A mail to `info@` would arrive back as a second conversation, and the legacy path's notification must not run beside this one at cutover — one ingestion path per submission.
