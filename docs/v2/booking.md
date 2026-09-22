# Booking and video calls V2 — product, backend, and frontend specification

Status: ready for the owner's plain-language review. This records the agreed V2
scope and implementation handoff. It does not authorise deployment, live
email/video setup, legacy removal, a commit, or a push. Read `foundation.md`
and `inbox.md` for V2 boundaries and Inbox correspondence. Legacy booking/call
code is evidence, not an automatic V2 requirement.

## Agreed product direction

- One owner manages the appointment calendar. Visitors can book from the public website without an account. The owner can create different free appointment types and configure each duration.
- The visitor chooses an in-person meeting, a video meeting, or an ordinary phone call. Video is the default selection; the owner personally prefers an in-person meeting when practical. A phone appointment is a normal telephone call placed manually by the owner, not a paid telephony integration and not merely the website video room with the camera off.
- An available visitor-selected slot is confirmed immediately without manual owner approval. Availability comes from owner-managed weekly hours and date exceptions. No Google/Outlook calendar sync in this version. Default earliest booking is 24 hours ahead and the booking window extends 60 days; both values are editable in Dashboard settings. These visitor booking limits do **not** restrict the owner: the owner may create an appointment manually even one minute before its start. Exact safe bounds and the behavior of already confirmed bookings after a settings change belong in the completed specification.
- Visitors may cancel or reschedule themselves through a private emailed link until 12 hours before the start. The owner can still make changes from Dashboard. Prevent overlapping confirmed appointments even when requests arrive concurrently.
- For an in-person appointment, the time is confirmed but the venue is shown as “to be agreed”; owner and visitor agree later through Inbox. Do not publish the owner's home address or invent a default meeting place.
- The website hosts a private two-person video room. It supports camera, microphone, screen sharing, and text chat. No video/audio recording. Chat is temporary and not retained after the call; the appointment record itself remains saved. The visitor does not need a Dashboard account.
- Use **Cloudflare RealtimeKit** for the managed video-room media layer. Backend2 keeps ownership of appointment rules, schedule checks, access timing, and the issuance of short-lived client access; never expose Cloudflare administrator credentials in the browser. Configure no recording, transcription, streaming export, or persisted chat. RealtimeKit is a future deployment dependency, not something to activate, pay for, or deploy during planning/local implementation without separate owner approval.
- The visitor's private video link may be opened early to test camera and microphone. Before the appointment starts, show a clear waiting/preflight screen confirming that the link works and the visitor is early; do not issue a media token or start the live room before the scheduled time. At the scheduled start, the visitor enters automatically without an owner admission step. If camera or microphone permission fails, offer the simple fallback of contacting the owner through Inbox or by phone.
- The public Booking form has required name and email, phone required only for Phone, optional company, optional “What is it about?” and “Budget range”, and optional note. It does not ask Timeline because the visitor already chooses a slot. The owner's request to remove the two selects applies only to Contact, never Booking. An answered Booking value may be shown in the appointment's Inbox conversation.
- Next to public submit, show a concise privacy notice and link to the applicable privacy policy in the visitor's language. Do not use a fake GDPR-consent checkbox or Terms acceptance unless the owner later introduces actual applicable terms. Before live launch, privacy copy/retention/provider disclosure needs owner/legal review; implementation cannot certify legal compliance.
- Each confirmed appointment is associated with an Inbox email conversation the owner can reply in. Send the visitor confirmation and change/cancellation messages by email. A single visitor reminder defaults to 24 hours before the appointment, with its timing editable in Dashboard (for example, 48 hours). No owner email notification or SMS in the MVP. Avoid duplicate Inbox conversations and notifications.
- The owner can also **create an appointment manually in Dashboard and send its details/invitation to a person's email address**. Manual creation has both **Save only** and **Save & send invitation**. It may be outside normal hours with a visible warning, but can never overlap an already confirmed appointment. A manually invited visitor receives the same private cancellation/rescheduling link as a public booking.
- Phone number is required only when the visitor selects a phone appointment. The number is private to the owner, who places the ordinary phone call manually.
- If an appointment is created after the configured reminder time, send its confirmation immediately but skip its now-impossible reminder. The owner may edit the single visitor-reminder timing in Dashboard.
- The owner manages the schedule in `Europe/Berlin`; visitors see appointment times converted to their device timezone with the timezone made clear.
- Use appointment states **Confirmed**, **Completed**, **Cancelled**, and **No show**. When the owner reschedules or cancels an appointment, send the visitor an email. Owner cancellation includes a reason. Visitor cancellation uses radio-button reasons plus **Other** and typed text, stored with the appointment.
- Each appointment type can restrict its permitted meeting methods independently (for example, video only or in-person only). The owner configures its duration and an optional buffer between appointments. The owner wants business settings editable in Dashboard: appointment types, methods, durations, buffers, weekly hours/exceptions, visitor booking limits, cancellation/reschedule limit, and reminder timing. Do not expose security secrets, provider credentials, or low-level video/email infrastructure as editable Dashboard switches.
- When the scheduled video duration ends, show both participants a clear over-time notice but keep the room open until the owner ends it manually. Do not cut off an active conversation automatically.
- Visitor cancellation shows a short set of radio-button reasons plus **Other** with a typed explanation. Save the selected reason and any Other text with the cancelled appointment, and include the appropriate cancellation information in the owner-facing record. Visitors may reschedule more than once while the 12-hour limit and available-slot rules permit it.
- Confirmation, reminder, reschedule, and cancellation emails use the public page language selected by a visitor. When the owner creates an appointment manually, the owner explicitly chooses German, English, or Arabic for its email communication.
- A confirmed visitor booking shows its details and private manage link both on the success page and in the confirmation email. Video appointments show their private video entry in both places. In-person appointments say that the meeting location is agreed with Yaman by email; Phone appointments say Yaman will call the supplied private number.

## Public workflow and lifecycle

1. The visitor chooses an enabled type, an allowed meeting method, and a server-returned slot. Slots are displayed in the visitor's device timezone with that timezone clearly named; the server stores the instant and owner timezone.
2. Client validation uses TanStack Form under the repository-wide submit-then-change validation rule. The server validates every field and rechecks availability inside the booking transaction. Keep current public anti-abuse protection until a separately approved replacement.
3. A valid booking is immediately `CONFIRMED`, reserves the slot, creates exactly one linked Inbox conversation, and triggers its language-matched confirmation email. It does not create a Lead or Client.
4. The visitor may cancel or reschedule any number of times via the private manage link while at least 12 hours remain and a valid replacement slot exists. Rescheduling preserves type and method; it does not silently turn a Video appointment into Phone or In-person.
5. The owner may reschedule, cancel with reason, or mark the appointment completed/no-show from Dashboard. Owner cancellation and rescheduling notify the visitor. A cancelled appointment stops any reminder.
6. Send one visitor reminder at the configured time. If a booking is created after that moment, send confirmation but skip the impossible reminder. A new rescheduled time can receive one appropriate future reminder.

## Video-room security and behavior

- One confirmed Video appointment maps to one private RealtimeKit meeting with exactly two roles: owner/host and visitor. Backend2 enforces both the appointment state/method/time and the two-person limit before issuing access.
- Camera, microphone, screen share, and temporary in-call text chat are enabled. Recording, transcription, streaming export, and stored chat are disabled. Appointment data stays saved; call media/chat content does not.
- The preflight page lets the visitor test their camera/microphone early, but they wait until the appointment start. At the start, Backend2 issues scoped visitor access and the visitor enters automatically. Owner entrance from Dashboard is independent; no owner admission is required.
- At scheduled end, both people see an over-time notice. The owner ends the room manually. As the security default, fresh joins stop one hour after scheduled end, even if a joined call has not yet been ended; revisit this operational limit at deployment rather than keeping old links usable forever.
- Backend2 creates provider meetings and participant access only after its own authorization checks. Cloudflare administrator credentials remain server-only. Ordinary tests fake the provider; no ordinary test creates paid media usage or proves production calls work.

## Dashboard scope and API contract

`/dashboard/calendar` is English-only initially. It offers a bounded date-range calendar and a paginated/searchable appointment list, with deterministic order and type/method/status/date filters. It covers loading, empty, error, not-found, unauthorized, and forbidden states.

Appointment details show private contact fields, method, note, optional subject/budget, linked Inbox conversation, message/reminder delivery state, and history of scheduling/status changes. The owner can create, save, invite, reschedule, cancel, complete, mark no-show, and join/end video when relevant.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v2/public/booking/types` | Enabled types/methods in visitor language |
| GET | `/api/v2/public/booking/types/:slug/slots` | Bounded available slots for method and timezone |
| POST | `/api/v2/public/booking/appointments` | Validate and immediately confirm public booking |
| GET | `/api/v2/public/booking/appointments/:reference` | Private visitor management projection |
| POST | `/api/v2/public/booking/appointments/:reference/reschedule` | Visitor reschedule within policy |
| POST | `/api/v2/public/booking/appointments/:reference/cancel` | Visitor cancellation with reason |
| POST | `/api/v2/public/booking/appointments/:reference/video/preflight` | Private preflight state, no media token early |
| POST | `/api/v2/public/booking/appointments/:reference/video/join` | Scheduled visitor video access |
| GET | `/api/v2/owner/calendar/appointments` | Paginated/filterable list or bounded calendar range |
| POST | `/api/v2/owner/calendar/appointments` | Manual Save only or Save & send creation |
| GET/PATCH | `/api/v2/owner/calendar/appointments/:id` | Detail and owner edit/reschedule |
| POST | `/api/v2/owner/calendar/appointments/:id/send-invitation` | Idempotent delayed invitation |
| POST | `/api/v2/owner/calendar/appointments/:id/cancel` | Owner cancellation with reason |
| POST | `/api/v2/owner/calendar/appointments/:id/status` | Completed or no-show |
| POST | `/api/v2/owner/calendar/appointments/:id/video/join` | Owner video access |
| POST | `/api/v2/owner/calendar/appointments/:id/video/end` | Owner ends video room |
| GET/POST/PATCH/DELETE | `/api/v2/owner/calendar/types` | Paginated type management |
| GET/PUT | `/api/v2/owner/calendar/settings` | Business settings |
| GET/PUT | `/api/v2/owner/calendar/availability` | Weekly hours and exceptions |

Exact shared contracts must use safe stable errors for invalid form/timezone,
unavailable/overlapping slot, too-early/far request, cancellation deadline,
invalid private credential, non-video request, provider unavailable, duplicate
submit, message/reminder failure, missing resource, and owner forbidden access.

## Privacy, security, and reliability

- Server validation and rate limits protect public booking, manage, and video routes. Database constraints/transactions prevent double booking. A slot shown earlier is never trusted later.
- Private manage credentials are high entropy and treated like passwords: never log them, infer them from email/reference, or expose them in errors.
- Keep personal data, email, phone, notes, cancellation reasons, video tokens, provider IDs, and attachments out of logs and public APIs. There is no public calendar, public participant list, visitor account, recording, transcript, or retained chat.
- Retention/deletion policy is deliberately deferred to the owner’s actual privacy-policy review. Do not invent a legal retention time. Before real launch, verify RealtimeKit terms/current price, privacy disclosure, email sender, reminder scheduler, owner authentication, and real safe test bookings/calls.

## Verification and definition of done

Backend tests and runtime checks cover translations/types/order/pagination,
availability/exceptions, Europe/Berlin daylight-saving and visitor timezone
conversion, buffers, limits, concurrent double-booking denial, public/manual
creation, delayed invite idempotency, Inbox uniqueness, conditional phone,
emails/reminders/languages, reasons and state changes, private access denial,
no secret disclosure, and fake-provider preflight/join/failure/two-seat/overtime
behavior.

Run typecheck, relevant automated tests, build, and proportional local runtime
checks after backend work. Then make an isolated interactive Design Lab with
sample data and rendered desktop/mobile views: public booking, success/manage,
manual creation, change/cancellation, and video preflight/waiting/failure. Wait
for the owner’s explicit visual approval before production frontend work. Then
browser-test connected flows. A mock or provider API test is not proof that live
email/video works.

## Handoff prompt for Claude — execute only on the owner's read-to-build request

> This is an implementation request, not a summary request. Read `AGENTS.md`, `docs/v2/foundation.md`, this entire `docs/v2/booking.md`, and relevant `auth.md`, `inbox.md`, and `media.md`. Inspect Backend2, Dashboard, legacy booking/call/email code, migrations, tests, and working-tree changes as evidence only. Do not import legacy data/code, overwrite concurrent work, alter live `/admin` or public behavior, deploy Cloudflare services, activate paid RealtimeKit, or remove anti-abuse protection as a side effect.
>
> Before backend work, ask the owner only about a genuinely material unanswered backend decision. Otherwise implement and verify Backend2 first: migrations, typed contracts, types/settings/availability, slots, public/manual booking, lifecycle, Inbox link, email/reminder adapters, private manage access, cancellation/reschedule, timezone/DST, pagination, security, and tests. Put RealtimeKit behind a testable fakeable adapter; do not claim live media/email works. Report exactly what is verified and untested before frontend work.
>
> Then ask only material frontend questions. Use the `frontend-design` skill for an isolated interactive Design Lab with rendered desktop/mobile sample states. Include booking, success/manage, calendar/manual creation, change/cancellation, and video preflight/waiting/failure. Recommend a design and wait for explicit owner visual approval. Only then build approved production UI with TanStack Form where applicable, test connected flows, review the exact diff, and commit/push only if the owner asks, only to `main-v2`. Do not deploy or cut over legacy services.
