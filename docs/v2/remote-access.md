# Remote Dashboard access — plan for the owner's approval

Status: **proposal, 24 Sep 2026. Nothing is enabled.** Today every owner
route and the V2 sign-in answer only on the owner's own computer (the
local-only fence, `src/backend2/security/local-only.ts`); a production build
exposes neither (verified under `workerd`, `auth.md`). This plan is the one
deliberate, separately reviewed change `auth.md` requires before the
Dashboard works from the internet.

## What already protects the Dashboard

- Passkey sign-in (device verification required), with password + authenticator
  code and one-time recovery codes as the fallback — built and tested.
- Seven-day server sessions stored only as hashes, `HttpOnly` + `Secure` +
  `SameSite` cookies, CSRF double-submit on every write, Origin check.
- Server-side limits on passwords (per address and, since 24 Sep, per account),
  codes, passkey ceremonies, resets.
- Every owner route answers `404` to a stranger — not `401` — so a scanner
  cannot even tell the Dashboard API exists.

## The proposal

1. **A second, independent lock in front: Cloudflare Access (free).** Before
   the Dashboard page or any owner API is even reached, Cloudflare asks for a
   one-time code sent to the owner's email (or a Google sign-in). A request
   without that pass is stopped at Cloudflare's edge and never reaches the
   application. Applied to `/dashboard*`, `/api/v2/owner/*` and
   `/api/v2/auth/*`. Free for a single user. Then the V2 passkey sign-in is
   the inner lock. Two different companies' checks must both pass.
2. **A new, explicit server mode `BACKEND2_OWNER_API=remote`** replacing the
   local-only fence in production only when **all** of these hold, otherwise
   the owner routes stay unmounted (fail closed):
   - a production build with `AUTH_V2_SECRET` (≥ 32 chars), `AUTH_V2_ORIGIN`
     (`https://…`) and `AUTH_V2_RP_ID` set;
   - `BACKEND2_OWNER_AUTH=required` is implied and cannot be turned off;
   - each request's host must equal the configured origin's host;
   - optionally, the Cloudflare Access assertion header
     (`Cf-Access-Jwt-Assertion`) must be present and valid for the configured
     Access audience — so the application itself also refuses a request that
     somehow bypassed the edge.
3. **Before switching it on:** a verified email sender for password reset,
   one rehearsal of the lost-everything recovery runbook on a disposable copy,
   a database backup/restore check (Neon point-in-time restore), and a
   rollback: removing `remote` puts the fence back instantly.
4. **Tests:** every owner route refuses without Access header / without
   session / with a wrong host / with missing secrets; `/admin` and public
   pages unaffected; the build under `workerd` with and without the mode.

## Questions for the owner

1. **Add Cloudflare Access as the outer lock?** Recommended **yes**: it costs
   nothing, and a stranger never even sees the sign-in page.
2. **Address of the Dashboard:** keep `yamanwarda.de/dashboard` (recommended:
   one site, one passkey origin) or use `admin.yamanwarda.de`.

After the answers: implement the `remote` mode and its tests locally (no
deployment), then walk the owner through the Cloudflare Access setup step by
step, then a preview deployment of `main-v2` to test everything on the
internet before the real site changes.

## Owner decision — 24 Sep 2026

The owner chose **no Cloudflare Access and no separate Dashboard host**: the
Dashboard stays at `yamanwarda.de/dashboard` and is reachable from the
internet, protected by the V2 sign-in (passkey, or password + authenticator
code, recovery codes) with its server-side limits. The `remote` mode below is
therefore implemented without the Access pass; everything else in the plan
stands (secrets, host check, session always required, prerequisites, tests).

## Implementation record — 24 Sep 2026

- `BACKEND2_OWNER_API=remote` in `src/backend2/security/local-only.ts`: owner
  and sign-in routes mount only when `AUTH_V2_SECRET` (≥ 32 chars), an
  `https://` `AUTH_V2_ORIGIN` without a path and `AUTH_V2_RP_ID` are all set;
  otherwise nothing mounts, as before. `local` still never opens in a
  production build.
- Per request (`decideOwnerRequest`): only the configured host — a
  `workers.dev` address or any other hostname gets `404`. On the site host a
  missing session answers `401` (the sign-in page itself is public anyway).
- The V2 session is always required in `remote` mode, whatever
  `BACKEND2_OWNER_AUTH` says; the Dashboard page guard follows the same rule.
- The sign-in API now carries the same per-request gate in both modes (before,
  in `local` mode it relied on mounting alone).
- Verified: `src/tests/backend2-remote-access.test.ts` and the full suite.
- Not done yet, before switching it on: production secrets on Cloudflare,
  a verified email sender, one rehearsal of the lost-everything runbook, a
  backup/restore check, and a first run on a separate preview address.
