# Authentication V2 — module specification

Status: **implemented and in daily use, confirmed 22 Sep 2026.** The owner signs
in with it, and `BACKEND2_OWNER_AUTH=required` is set locally, which means V2
sessions — not the legacy admin session — are what guard `/dashboard` and every
`/api/v2/owner/**` route, including the shared Media library. What is *not*
claimed here is that every item in the verification list below has been ticked;
check the implementation against it before changing anything.

Owner decisions recorded; verify current implementation state before continuing. The owner's explicit read-to-build instruction supplies approval to implement or finish this V2 module under `AGENTS.md`. This document alone does not authorize changing the live legacy sign-in, deployment, or cutover.

## Purpose

Give the owner secure access to Dashboard V2 and every owner-only Backend2 operation before any of them becomes available outside local development. A hidden route, private Git branch, client-side redirect, or CORS rule is not authorization.

## Confirmed boundaries

- Authentication was deliberately deferred during the local-only Projects slice. That work must not expose owner-only Backend2 APIs remotely in the meantime.
- V2 authentication must include MFA before remote access is enabled.
- The first V2 release has exactly one user: the owner. There is no public account registration or team access.
- V2 uses a new owner account and identity/session store in the V2 database, independent of the legacy `/admin` account. The owner may use the same email address for both; the legacy account stays intact during transition. Initial account creation is a restricted local, one-time setup; there is no public sign-up or initial email-verification step.
- The primary sign-in is passwordless WebAuthn passkey with required device-local user verification. The owner wants to sign in quickly through the laptop or phone's fingerprint when available. The device may instead use face recognition or a PIN; the site cannot demand or receive the fingerprint itself. A successful verified passkey sign-in does **not** ask for a password or TOTP as another step.
- Email + password followed by an authenticator-app code (TOTP) is the fallback sign-in path. One-time recovery codes substitute for the TOTP step if the authenticator device is lost. No password-only sign-in and no "trust this device" MFA bypass, including on the owner's personal device.
- The owner wants a persistent sign-in, not a literal never-expiring credential. A full sign-in grants a session lasting **7 days maximum**, including through browser restarts. At day 7, the owner signs in again with a passkey or the two-step fallback. There is no separate shorter inactivity logout or sliding extension past day 7. Logout, revocation, and security events can end a session sooner.
- The owner can change both the email address and password. There is no routine email verification for the initial single-owner account or ordinary sign-in; changing the login email requires one-time confirmation at the new address before the change takes effect.
- If the password is forgotten, the owner can request a password-reset link sent to the registered email address. Resetting the password does not disable MFA: an authenticator code or an approved one-time recovery code is still required at the next sign-in.
- If the owner can still use a registered passkey, that remains a normal sign-in path even when the authenticator device and recovery codes are lost. If *all* sign-in factors are unavailable (passkeys plus TOTP/recovery codes), there is no online or email-only self-service bypass. Recovery requires a documented manual procedure with technical assistance, session revocation, MFA re-enrollment, and an audit trail; it must be rehearsed before deployment.
- The owner wants the Cloudflare human-verification challenge removed from the future V2 sign-in experience. The replacement abuse protections must be designed and tested; removing a widget alone is not a security design.
- Keep legacy `/admin`, its authentication and database, the current `/dashboard` guard, and live Turnstile protections unchanged until a separately approved and verified cutover.
- The public contact and booking forms are a separate anti-abuse decision; the sign-in preference does not automatically remove their Turnstile checks.
- Dashboard V2 starts English-only. The public website keeps its accepted design.
- The V2 sign-in screen is simple and standalone, using the Dashboard's visual identity rather than copying the legacy `/admin/login` screen. Its rendered design still requires owner approval before production frontend implementation.

## Backend scope and security policy

- Protect the Dashboard, every owner-only Backend2 route, and private project/media previews on the server. Public read routes must remain public but reveal only published data.
- Include sign-out, session expiration/revocation, rate limiting, generic login errors, and tests for direct API access without a session.
- Use a V2-only server-side session, bound to a Secure, HttpOnly, SameSite cookie (Secure in production HTTPS; a separately safe localhost setting for development). Expire it server-side 7 days after full sign-in, without sliding that deadline. Rotate session identifiers safely within the period without extending the deadline. Protect cookie-authenticated writes against CSRF and never rely on client-side route hiding.
- Initial owner creation is a controlled one-time setup, not a public registration endpoint. Passwords, TOTP secrets, recovery codes, passkey private keys, reset tokens, and session secrets must not be logged or committed. Protect secrets appropriately at rest; hash one-time recovery and reset tokens, consume them atomically, and make reset/recovery requests non-enumerating.
- Require fresh authentication before changing email, password, passkeys, or MFA. Email change confirms the new address before activation; password change/reset and MFA replacement revoke existing sessions as specified in the final session policy. Lost-all-factors recovery cannot be performed from the public website or email alone.
- Provide owner controls to see and revoke active sessions and registered passkeys, including "sign out all devices"; do not claim a device name or geolocation is exact if it is inferred from request metadata.
- Apply abuse controls to sign-in, second-factor attempts, reset requests, enrollment, and recovery without adding Turnstile to the V2 login. Rate limits must be enforced server-side and tested; identify the actual storage/rate-limit mechanism before implementation on Cloudflare Workers.
- Do not deploy or cut over until login, MFA enrollment, recovery, denial paths, and rollback are verified in a suitable non-production environment.

## Frontend behavior — visual execution still requires Design Lab approval

- A standalone English-only V2 sign-in screen, outside the authenticated Dashboard shell. It uses the Dashboard's existing Studio Workbench identity, brand mark, blue accent, typography, light/dark behavior, and responsive rules; it does not copy the legacy `/admin/login` form or invent a new visual system. Keep the screen focused on the task, without decorative metrics or a marketing hero. The owner approved this direction; exact visual execution remains subject to the rendered Design Lab.
- Primary action: "Sign in with a passkey". When no passkey is available or the prompt is cancelled, keep the fallback path visible: email and password, then Authenticator or a one-time recovery code. Errors must help the owner retry without revealing whether an email address exists.
- Offer the device's passkey prompt only after enrollment; show a clear non-passkey path on unsupported devices or cancelled prompts. A verified passkey completes sign-in without asking for a password or TOTP. Never display a fake fingerprint capture or imply that biometric data reaches the website.
- The sign-in screen includes a forgotten-password route. Requesting a reset gives a neutral confirmation; the link leads to a new-password form, then the normal MFA sign-in step remains in force.
- First-time MFA enrollment: show QR and manual setup key, require one valid authenticator code, then present recovery codes for safe storage. Do not treat enrollment as complete merely because the QR was shown.
- Dashboard Settings gains a Security area for changing email and password, reviewing MFA/recovery options, and signing out. An email change remains pending until the new address is confirmed. The exact recovery and active-session controls depend on the approved backend policy.
- Security Settings also manages passkey registration/removal and active sessions. Confirm dangerous changes with fresh authentication and show which session is current. A cancelled passkey prompt leaves the form usable.
- Show clear loading, invalid input, wrong-code, expired-link, rate-limited, success, and lost-device states. Forms follow the repository-wide TanStack Form validation rule. Design and browser-review the mobile and desktop flows before production UI implementation.
- The exact visual treatment must be reviewed as a rendered Design Lab before production UI implementation.
- V2 sign-in lives at `/dashboard/login` outside the protected Dashboard shell; the implementation must avoid a redirect loop from the current `/dashboard` parent guard. Successful sign-in returns only to a validated same-origin Dashboard path; otherwise use `/dashboard`.

## Agreed planning and delivery sequence

1. Discuss all material Backend2 and frontend behavior with the owner in the conversation. Record the answers and the final backend, UI, security, failure-state, and test contracts in this document. Do not use unanswered prompts or legacy behavior as silent requirements.
2. The owner's instruction to read `auth.md` to start work supplies implementation approval under the repository-wide convention in `AGENTS.md`; a read-only or review request does not.
3. Claude implements the Backend2 authentication, database/migrations, and server-side protection first. Claude asks the owner only if an implementation decision is still material; otherwise it completes and verifies the backend, including denied direct API access, MFA, recovery, and existing-system isolation. Report what passed and what was not tested.
4. After backend verification, Claude asks the owner only about material frontend/UX questions still unanswered. Otherwise build an isolated, interactive Auth Design Lab showing the sign-in, MFA, enrollment, recovery, and Security Settings flows. Explain the recommended design and tradeoffs, and show rendered desktop and mobile results. The Design Lab is not the production frontend.
5. Stop for the owner's explicit approval of the rendered design. Only then implement the real frontend, connect it to the verified backend, and test the complete flows in browser and runtime. Do not remove the legacy sign-in or its protections during this phase.
6. After the agreed module is complete and verified, review the exact changed files. Commit/push the approved Auth work to `main-v2` only when the owner requests that Git action. Preserve unrelated owner/Projects changes; do not deploy to production or modify `main` as part of this handoff.

## Detailed implementation contract

- **Identity:** exactly one V2 owner record in the V2 database, independent of `/admin`; no registration endpoint. Provision through a restricted local one-time CLI/task, with interactive hidden password input or an equally safe mechanism that never prints, logs, or commits the password. The setup must refuse to overwrite an existing owner. Same email as legacy is permitted, but no shared sessions or cross-database writes.
- **Enrollment:** an owner cannot use remote Dashboard or owner APIs until initial password and TOTP enrollment are complete and recovery codes have been presented once. Verify TOTP before enabling it. Register each passkey only from a fully authenticated, recently verified owner session; verify challenge, origin, RP ID, user presence, and user verification server-side. Allow multiple named passkeys so laptop and phone can each be enrolled; do not require a passkey-capable device to use the TOTP route.
- **Passkey assurance:** if the implementation uses the existing Better Auth dependency, inspect its passkey and 2FA plugin behavior rather than assuming a 2FA challenge runs after passkey sign-in. The passwordless route is acceptable only when WebAuthn user verification is required and actually verified server-side. Never add a silent password-only bypass through another provider or auth endpoint.
- **Sign-in:** passkey is the primary passwordless route, with device-local user verification required and no second password/TOTP prompt. The fallback route checks email/password first. A valid password step produces only a short-lived, one-use, server-side pending challenge, never an authenticated owner session; finish with verified TOTP or a one-time recovery code. Wrong/expired/replayed steps never create a session. Every new session uses the passkey or fallback MFA, including on the owner's personal device.
- **Credentials and recovery:** neutral responses for unknown email and reset requests; expiring, one-use password-reset link to the registered address. Resetting a password never disables MFA or remove passkeys. A used recovery code is invalid forever; allow regeneration only after fresh authentication and replace the old set. A lost TOTP device can be replaced through a freshly verified passkey or remaining recovery code. If all sign-in factors are lost, pause remote access and follow the manual recovery runbook below.
- **Session and authorization:** every `/dashboard` loader/server action, every `/api/v2/owner/**` route, private media, and preview is enforced on the server. Public published reads stay unauthenticated. An unauthorized API request is denied without private data, and UI routes lead to V2 sign-in with a safe local return path. Every session ends no later than 7 days from full sign-in, regardless of activity. Logout and "sign out all devices" revoke server-side. Security changes require fresh passkey verification or the full password+TOTP/recovery-code fallback, not merely a still-valid cookie.
- **Email and password change:** require fresh verification; keep old email active until the new email's one-use link is confirmed. Expired links and conflicting changes do not alter identity. Password changes/reset revoke all existing sessions; the owner signs in again. Send security notices to the old email when the address changes, and to the account email after password/MFA changes, without leaking secrets.
- **Abuse and privacy:** server-enforced limits for passwords, second factor, reset and enrollment; generic public errors, short pending-challenge lifetime, no secrets in URL logs, no caching of sensitive responses, and no account enumeration. HTTPS and correct production origin are preconditions for passkeys; local browser tests may use localhost.
- **Migration/cutover:** add `0002_auth.sql` after the current `0001_projects.sql` with `v2_` owner, passkey, session, challenge, recovery-code, reset, pending-email-change, rate-limit, and security-audit tables as needed, using the existing V2 migration ledger. Database shape may consolidate tables, but must support atomic single-use consumption, revocation, expiry, and audit without legacy joins. Keep the local-only Projects fence until a verified authenticated owner-route replacement exists; do not accidentally make owner APIs public by removing a guard first. Preserve legacy `/admin` and its session during V2 rollout. Production variables, email delivery, passkey origin/RP ID, database, Worker behavior, rollback, and backup restoration need a pre-deploy checklist.
- **API contract:** the routes below are the intended behavior under `/api/v2`; if a trusted authentication library owns equivalent internal paths, map them explicitly in a written contract rather than expose extra unaudited endpoints. No V2 route may import legacy auth state or allow public registration.
- **Frontend:** standalone English-only login plus MFA/passkey/recovery/reset screens, and a Security section within Dashboard Settings. Use TanStack Form and the repository's submit-then-change validation pattern. Cover pending, invalid, expired, rate-limited, offline, unsupported-passkey, cancelled-prompt, success, forbidden, and lost-device states. Keep the rendered Design Lab isolated from production and from real credentials/data, then wait for explicit owner approval.
- **Verification:** migration against a fresh V2 database; tests for each factor and replay/expiry, blocked direct owner API access, media/preview denial, CSRF, rate limits, session revocation, reset and email-change links, passkey wrong-origin/wrong-challenge/wrong-user-verification, and legacy/public isolation. Run typecheck, relevant tests, build, local runtime/browser flows on desktop/mobile, and a Worker-compatible integration check before reporting complete. Distinguish verified from untested and do not deploy automatically.
- **Definition of done:** backend passes all tests and real runtime checks, owner approves a rendered interactive Design Lab, production frontend passes connected browser flows, scope diff and staged files are reviewed, and only the agreed Auth files are committed/pushed to `main-v2`. Deployment/cutover remains separate approval.

### Route and response contract

These names describe the stable app-level capabilities. A library may provide an equivalent path only if its extra endpoints are audited and the public/owner boundary below remains exact. JSON replies use the existing Backend2 `{ success, message, data }` or `{ success, message, code }` envelope, with `Cache-Control: no-store`; tokens, TOTP secrets, recovery codes, and hashes never appear in ordinary read responses.

| Method and path | Access | Purpose and result |
|---|---|---|
| `POST /api/v2/auth/passkey/start` | public, rate-limited | Issue short-lived challenge; no account-existence disclosure. |
| `POST /api/v2/auth/passkey/finish` | public, rate-limited | Verify WebAuthn challenge, origin, RP ID and user-verification flag; issue 7-day owner session or fail without one. |
| `POST /api/v2/auth/password/start` | public, rate-limited | Validate email/password; return only a one-use MFA challenge, never an owner session. |
| `POST /api/v2/auth/password/finish` | public, rate-limited | Consume MFA challenge plus TOTP or recovery code atomically; issue owner session. |
| `POST /api/v2/auth/enrollment/totp/start` and `/confirm` | restricted setup challenge only | During first account setup, return QR/manual key, verify first TOTP, show recovery codes once, and only then permit an owner session. Never grant Projects/Dashboard access from a setup challenge. |
| `POST /api/v2/auth/password-reset/request` | public, rate-limited | Accept email, always show neutral confirmation; send one-use reset link only to the registered account. |
| `POST /api/v2/auth/password-reset/complete` | public, rate-limited | Consume reset token and set new password; revoke sessions; next login still needs passkey or password+MFA. |
| `POST /api/v2/auth/email-change/confirm` | token holder, rate-limited | Consume pending-email-change token; switch address once and revoke sessions. |
| `GET /api/v2/owner/security` | owner session | Return current email, factor-enrollment state, passkey summaries, current session and bounded recent security events; never secret material. |
| `POST /api/v2/owner/security/reverify` | owner session | Fresh passkey or fallback two-step proof; return short-lived, action-scoped step-up capability, not a new long session. |
| `POST /api/v2/owner/security/passkeys/start` and `/finish` | owner + step-up | Register and name a new passkey; no unauthenticated enrollment. |
| `DELETE /api/v2/owner/security/passkeys/:id` | owner + step-up | Remove a passkey, but never leave the account with no usable sign-in path. |
| `POST /api/v2/owner/security/totp/start` and `/confirm` | owner + step-up | Enroll or replace TOTP; show setup secret only during the pending ceremony, verify before activation, then show new recovery codes once. |
| `POST /api/v2/owner/security/recovery-codes/rotate` | owner + step-up | Replace entire code set; old codes become invalid atomically, new codes shown once. |
| `POST /api/v2/owner/security/password/change` | owner + step-up | Change fallback password; revoke all sessions; require new sign-in. |
| `POST /api/v2/owner/security/email-change/request` | owner + step-up | Send one-use confirmation to new address; old address remains active until confirmed. |
| `GET /api/v2/owner/security/sessions` and `DELETE /api/v2/owner/security/sessions/:id` | owner session | Paginated session list and per-session revocation; distinguish current session. |
| `POST /api/v2/owner/security/sessions/revoke-all` | owner + step-up | Revoke every session and clear the current cookie. |
| `POST /api/v2/auth/logout` | owner session | Revoke current session and clear cookie. |

Requests use strict server validation and limited body sizes. Passkey start/finish exchange opaque WebAuthn public-key options/credential objects, not biometric material. Password start accepts email/password and returns only an opaque `challengeId`; password finish accepts that `challengeId` plus exactly one TOTP or recovery code. A completed sign-in sets the cookie and returns only owner-safe profile data, not session secrets. Reset/email-change requests accept a validated email, and consume requests accept an opaque one-use token plus the new value. Owner mutations accept only the fields needed for that action; list responses contain bounded items, cursor/page information and no secrets. An authenticated session never appears in JSON as a bearer token.

Public attempts have generic error text; authenticated Security Settings may show actionable errors. A missing/expired session yields `401` on owner APIs without leaking owner data, while a non-existent resource yields `404`; disabled/not-mounted V2 owner routes remain `404`. A pending MFA or setup challenge is **not** an owner session. For owner lists, including sessions/audit events, use bounded server-side pagination per `AGENTS.md`. Browser navigation to private routes redirects to the V2 sign-in screen with a safe same-origin return path, never an external redirect.

### Time limits, abuse controls, and email

- Session: exactly 7 days maximum from full sign-in. Expire server-side and delete/revoke on logout. Never extend by activity alone. No separate short idle logout. Rotate cookie secrets without resetting the full-authentication timestamp.
- Password MFA challenge and WebAuthn challenge: no more than 5 minutes, one use. Step-up capability: no more than 5 minutes, scoped to the requested action; never a general owner API credential.
- Password-reset link: no more than 30 minutes, one use. Email-change link: no more than 24 hours, one use. New request invalidates older outstanding links of the same kind. Never place the raw token in analytics, logs or referrer-bearing navigation.
- Rate-limit password attempts, MFA attempts, WebAuthn ceremonies, reset requests, email changes and enrollment by both source and account or challenge where applicable. Use shared storage that works across Worker instances, not a process-local map. Set bounded limits in the backend contract/tests and return `429` with neutral messaging. This replaces the requested V2 login challenge but does not alter live Turnstile or public forms.
- Use a V2-owned mail adapter with the existing configured Resend provider, separate templates and no import from the legacy backend. Local/test runs fake delivery and expose no public reset link. Before deployment, verify a sender/domain and actual delivery; if missing, reset/email-change features must fail safely and Auth is not production-ready.
- Use library-supported password hashing, TOTP and WebAuthn verification rather than inventing cryptography. Review Better Auth's current passkey and 2FA plugin behavior, including the fact that passwordless methods may not automatically trigger a TOTP challenge; require user verification on the passkey route explicitly.

### Initial setup, emergency recovery, and cutover

1. Local setup CLI creates the single V2 owner in the V2 database, with no public setup route and no automatic reuse of the legacy admin record/password. Refuse a second owner or overwrite. Keep credentials out of command-line arguments, logs and Git.
2. First password sign-in may enter a restricted enrollment state only. It cannot access `/dashboard`, owner Projects APIs, or private media until TOTP is verified and recovery codes have been displayed once. Save codes outside the app. Then register laptop/phone passkeys from a fully authenticated Security Settings session; multiple passkeys are allowed. The setup UI must explain that a device may use PIN/face instead of fingerprint.
3. If passkeys are lost, use password+TOTP or a remaining recovery code. If TOTP is lost but a passkey works, use the passkey and fresh step-up to replace TOTP. If *every* sign-in factor is lost, no email-only reset disables MFA. The emergency runbook is an operator-only CLI performed with verified control of the V2 infrastructure/database, explicit owner confirmation, backup before mutation, audit entry, revocation of all sessions and old factors, then forced re-enrollment. No self-service endpoint. Rehearse in a disposable environment before deployment; do not put recovery secrets in the repository.
4. Introduce V2 auth behind the current local-only fence. Verify all owner endpoints, dashboard server loaders and private media deny unauthenticated access. Only then switch to V2 session authorization and enable remote owner routes in a separately reviewed environment. Existing `/admin` auth, Turnstile, database and public-site behavior remain unchanged; deployment/cutover to production requires separate approval and a rollback plan.

### Handoff prompt for Claude — execute on the owner's read-to-build request

> Read `AGENTS.md`, `docs/v2/foundation.md`, and this entire `docs/v2/auth.md` before changing code. Treat this approved Auth specification as the contract. Inspect the current Backend2, V2 database/migrations, Dashboard shell, current guards, and existing libraries; preserve legacy `/admin`, its database and auth, the public website, and unrelated owner changes. If any material decision remains open, ask the owner rather than inventing it.
>
> Implement and verify the Backend2 Auth phase first: separate single-owner V2 identity and local bootstrap, seven-day sessions, passwordless passkeys with required device user verification, fallback password+TOTP/recovery codes, reset/change flows, authorization rules, abuse controls, database migration, direct-route denial, and tests. Make sure the temporary local-only fence is replaced only when authenticated protection is verified; do not expose owner routes. Report exact checks, runtime evidence, and anything not tested. Stop before production frontend.
>
> After backend verification, ask the owner only about material frontend/UX questions still unanswered. Next, use the `frontend-design` skill and create an isolated interactive Auth Design Lab with realistic sample states for desktop and mobile, the existing Dashboard visual identity, and clear design recommendations/tradeoffs. Do not connect it to real credentials or data. Show it to the owner and wait for explicit design approval. Then implement the approved production frontend using TanStack Form, connect it to the backend, and verify end-to-end flows and security states. Review only the agreed module changes; commit and push those files to `main-v2` only when the owner requests that Git action. Do not push `main`, deploy, remove legacy auth, or cut over production without separate approval.

## Engineering choices and release prerequisites

The approved product behavior is specified above. Claude may select compatible, maintained authentication libraries, V2 table columns, exact cryptographic storage, rate-limit numbers/storage, and route-adapter details only if they preserve that behavior and are verified with tests. The existing Better Auth dependency is a candidate, not a mandate; it must be configured as an independent V2 instance, and all generated endpoints must be audited for unwanted sign-up/password-only bypasses. Record the final API request/response schemas and chosen mechanisms in this document before treating backend work as complete. Ask the owner if a library limitation would change the agreed passkey, MFA, seven-day session, or recovery behavior; do not silently weaken them.

The production domain/RP ID, verified email sender, secrets, V2 database, Cloudflare Worker compatibility, backup and manual-recovery rehearsal, and rollback checks are deployment prerequisites. Their actual values are not stored here or committed. Local backend implementation may proceed against safe development values after owner approval; it must not be described as production-ready until these prerequisites are tested. Any removal of Turnstile from public forms requires its own decision.

Security rationale: [W3C WebAuthn](https://www.w3.org/TR/webauthn/) describes device-local user verification and passkeys; [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) explains server-side expiry, renewal and revocation. These sources inform the proposed safeguards; they do not override the owner's product decisions.

---

## Backend implementation record

Added when the Backend2 phase was built. The section above is the owner's
approved behaviour; this one records the mechanisms chosen under the latitude
the "Engineering choices" section grants, and what has and has not been
verified. It changes no approved decision.

### Better Auth was evaluated and not used

The specification named the existing dependency "a candidate, not a mandate".
It is not used, for reasons that are about behaviour rather than taste:

- **Sessions.** Better Auth's session is a sliding window refreshed by
  activity. The approved policy is an absolute seven days from full sign-in
  with no sliding extension and with identifier rotation that does not move
  the deadline. Expressing that would mean overriding its session handling
  rather than using it.
- **The pending challenge.** A correct password must buy a short-lived,
  one-use, server-side challenge that is *not* a session. Better Auth's
  two-factor flow issues its own cookie at that point; auditing that it can
  never be mistaken for access is more work than owning the row.
- **Step-up.** The approved model is a capability scoped to one action and
  spent by it. Better Auth models freshness as an age on the session, which is
  a different guarantee.
- **Surface area.** It mounts many endpoints that would each need auditing
  against "no public registration, no password-only bypass". The specification
  asks for exactly the routes in the table above and no unaudited extras.
- **Storage.** It wants its own adapter and its own table names. V2 requires
  `v2_`-prefixed tables in its own migration ledger, and Backend2's injectable
  `Db` handle is what lets the integration suite run the real SQL against a
  real PostgreSQL in process.

The legacy `/admin` Better Auth instance is untouched.

### What is used instead

No cryptography is implemented here. Three audited libraries do that work:

| Concern | Mechanism |
|---|---|
| Password hashing | scrypt (N=16384, r=16, p=1, 64-byte key) from `@noble/hashes`, salted per password, parameters stored alongside the hash |
| WebAuthn | `@simplewebauthn/server` v13, with `requireUserVerification` **and** a second server-side assertion of the `userVerified` flag |
| TOTP | RFC 6238 over `@noble/hashes` HMAC-SHA1, 30-second step, ±1 step drift, and a stored high-water mark so one code is one sign-in |
| Secrets at rest | XChaCha20-Poly1305 from `@noble/ciphers` for the TOTP secret; SHA-256 for session, challenge and link tokens; HMAC-SHA256 for rate-limit keys and stored addresses |
| Randomness | `@noble/hashes` CSPRNG; recovery codes use rejection sampling over a 31-symbol alphabet with no character that is misread on paper |

All four are pure JavaScript and run unchanged on a Cloudflare Worker, where a
native argon2 or bcrypt binding cannot. `@noble/hashes` and `@noble/ciphers`
were already in the dependency tree — Better Auth itself uses both.

### Tables

`0002_auth.sql`, after `0001_projects.sql`, in the existing V2 ledger:
`v2_owner` (one row, enforced by a unique index on a constant),
`v2_owner_passkeys`, `v2_owner_sessions`, `v2_auth_challenges` (WebAuthn,
pending MFA and step-up in one table, none of which is a session),
`v2_auth_tokens` (reset and email-change links), `v2_owner_recovery_codes`,
`v2_auth_rate_limits`, `v2_security_events`.

Single-use is a property of the SQL, not of the JavaScript: every consumption
is one `UPDATE ... WHERE consumed_at IS NULL ... RETURNING`, so two
simultaneous requests carrying the same value produce exactly one winner.

### Deviations and additions worth knowing

- **Recovery codes arrive with the session, not before it.** The approved
  sequence is "show recovery codes once, and only then permit an owner
  session". They are in the same response as the session rather than a
  request earlier, because splitting them creates a state where the owner has
  closed the tab holding the only copy of their codes and cannot return to it.
- **`POST /api/v2/auth/logout` skips the CSRF check.** A forged sign-out costs
  the owner one click; a refused one can leave a session open on a machine
  they are walking away from.
- **Signing out one other device needs no step-up.** Signing out *everywhere*,
  which also ends the current session, does.
- **CSRF is a double-submit pair.** The session cookie is `HttpOnly` and
  `SameSite=Lax`; a second, readable `v2_csrf` cookie must be echoed in an
  `x-v2-csrf` header on every write. `Lax` rather than `Strict` so the
  email-change confirmation link does not arrive looking signed out.
  `src/start.ts` separately requires a matching `Origin` on every `/api`
  mutation, which applies here too.
- **Queries in this module run sequentially, never `Promise.all`.** A
  Cloudflare Worker may hold only six sockets open at once, and the Security
  Settings page would otherwise sit exactly on that ceiling.

### The switch from the fence to the session

`BACKEND2_OWNER_AUTH=required` makes the Projects and media owner routes demand
a V2 session on top of the local-only fence. It is absent by default, so the
fence is exactly as it was; the flag strictly adds a requirement and can never
remove one. Both positions are covered by tests. The new
`/api/v2/owner/security/**` routes ignore the flag and always require a
session.

`/api/v2/auth/**` is public by contract but currently mounted inside the same
local-only condition as the owner routes, per "Introduce V2 auth behind the
current local-only fence". Making V2 sign-in reachable from a deployment is one
deliberate change to `src/backend2/security/local-only.ts`, reviewed on its own.

### Frontend implementation record

Added when the approved design was built. The Design Lab is at
`https://claude.ai/artifact/WvC5Ni1xhkJEf3Aor8cTpZ`; what shipped follows it,
rebuilt on the repository's own tokens and classes rather than the lab's inline
styles.

**Routes.** `/dashboard/login`, `/dashboard/login/reset` and
`/dashboard/login/confirm-email`, all as `dashboard_.login…` files. The
trailing underscore is what keeps them out of the `/dashboard` layout and so
out of its guard — the redirect loop the specification warns about is
structurally impossible rather than avoided by care. Security Settings is
`/dashboard/settings/security`, inside the shell. The confirmation link for an
email change was moved out of Settings and onto the standalone route, because
confirming revokes every session and the owner may be reading the mail on a
device that was never signed in.

**Where a sign-in may land.** `safeReturnPath` accepts only a path under
`/dashboard` on this origin, and never the sign-in screen itself. An absolute
URL, a protocol-relative `//host`, a backslash anywhere, or anything that is
not a string becomes `/dashboard`. The route narrows the search parameter to a
string; the path rules live in one function both renders share.

**The guard has two positions.** `BACKEND2_OWNER_AUTH=required` moves
`/dashboard` from the legacy admin session to the V2 owner session and turns on
the V2 log-out in the account menu; absent, everything behaves exactly as
before. The log-out item is enabled only under the V2 session — ending a V2
session while the legacy guard is still the boundary would look like a
log-out that did nothing.

**Decisions worth knowing.** One code field rather than six boxes, so a pasted
code arrives whole. The passkey button is rendered only after mount: the
capability check reads `window`, and deciding it during the server render made
the button silently never appear. Security Settings loads in one request —
the first page of sessions rides along with the overview — which keeps the
factor list and the session list one snapshot, and is also the only shape that
works against the single-connection local development database. Every factor
action carries its own accessible name, because three rows otherwise show a
button reading "Replace".

### Verified

- `bun run typecheck`, `bun run test` (796 tests, whole repository), and
  `bun run build:cf`.
- 67 integration tests in `src/tests/backend2-auth.test.ts` against real
  PostgreSQL in process, 37 unit tests in
  `src/tests/backend2-auth-crypto.test.ts` including the RFC 6238 test vectors,
  and 44 screen tests in `src/tests/auth-v2-frontend.test.tsx`.
- A real sign-in against PostgreSQL over a socket: enrollment, seven-day
  session (604800s measured), owner API 200 with the cookie, 401 without it,
  404 from the live hostname, TOTP secret stored encrypted and recovered, the
  session cookie absent from the database.
- The built Worker under `workerd`: `/api/v2/` answers, and both
  `/api/v2/owner/security` and `/api/v2/owner/projects` answer 404 — a
  production build exposes neither the owner API nor V2 sign-in.
- The whole flow in a browser against a running dev server and a real
  PostgreSQL, with `BACKEND2_OWNER_AUTH=required`: `/dashboard` redirected to
  `/dashboard/login?redirect=%2Fdashboard`; a correct password reached
  enrollment and **not** a session; the QR and setup key rendered; a real TOTP
  code completed enrollment and showed ten recovery codes; the session cookie
  was absent from `document.cookie` while the CSRF cookie was readable;
  "Open the dashboard" stayed disabled until the codes were acknowledged;
  Settings → Security listed the real factors, the real seven-day session and
  the real audit trail; a step-up with password and code rotated the recovery
  codes; a write without the CSRF header answered 401, and a read with no
  cookie answered 401.

### Not verified, and why

- **A real passkey ceremony.** WebAuthn needs a real authenticator holding a
  real private key. The signature checking is `@simplewebauthn/server`'s and is
  covered by its own suite; the policy layer on top — user verification
  required and re-checked, challenge spent, credential bound to the owner,
  counter advanced, the library's origin/RP-ID message never reaching the
  client — is tested with the library mocked. The browser check above ran the
  password route; registering and using a passkey needs the owner's own device
  and is the one flow left to try by hand.
- **Real email delivery.** Tests and local runs fake it. A verified Resend
  sender and domain remain a deployment prerequisite; without one the
  reset and email-change routes refuse uniformly in production rather than
  half-working.
- **The emergency runbook.** Written but not rehearsed. The specification
  requires a rehearsal in a disposable environment before deployment.
- **Production values.** RP ID, origin, `AUTH_V2_SECRET`, the production
  database, backup and rollback are all still prerequisites. Nothing here is
  production-ready until they are tested.
