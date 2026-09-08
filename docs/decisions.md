# Decisions

Each entry records what was decided and why. Read the reasoning before proposing
a reversal — most of these were chosen against a plausible alternative.

Status: **Accepted** unless noted.

---

### D1 — One application on the Prime Estate architecture

One TanStack Start app with Elysia mounted at `/api`, PostgreSQL through `pg`
with raw parameterized SQL, Valibot validation, Eden Treaty typed client, React
Query for server state, TanStack Form for forms.

**Why:** it is a proven architecture in this author's own work, already
understood, and readable by an AI agent without guessing. A second service or an
ORM would add moving parts with no benefit at single-operator scale.

---

### D2 — Hetzner CX22 + Coolify, PostgreSQL in Docker on the same host

**Why:** client PII, leads, and invoices on a German server makes the GDPR story
trivial. Cron and background jobs work natively. PostgreSQL is local, so there
is no serverless connection-pooling problem. Cost is flat and small.

**Cost accepted:** backups and security updates are the operator's
responsibility. Mandatory: Hetzner snapshots, nightly `pg_dump` to a Storage
Box, `unattended-upgrades`, and one tested restore before phase 5.

**Rejected:** Vercel + Neon (serverless/Postgres friction, weaker data-residency
story). **Fallback if ops become a burden:** Railway.

---

### D3 — Own database and admin CMS, no external CMS

**Why:** one system instead of two content models and a second vendor, and the
platform being entirely self-built is the point of the portfolio story.

**Timing amendment:** the CMS is built in phase 3, not phase 2. Building an
editor for copy that is still being rewritten wastes the work. The schema is
designed early; content stays in code through the phase 1 rebuild.

---

### D4 — Build the booking system rather than use Cal.com

**Why:** the requirement is everything inside one admin, under one brand, with
no second platform. Cal.com cloud puts availability management on their
dashboard; Cal.com self-hosted means operating a second large application.
Neither satisfies the requirement.

**What makes it tractable:** one operator, two or three call types, low volume.
The hard parts of Cal.com — round-robin, seats, team routing, dozens of calendar
integrations — are never needed. Libraries carry the rest: Luxon or
`@date-fns/tz`, `googleapis`, `ics`, `react-day-picker`, Resend + React Email,
`pg-boss`.

**Known risks:** DST edge cases and Google OAuth token refresh.
**Mitigation:** v1 ships with no external calendar at all.

---

### D5 — Both payment methods, with `payments` separate from `invoices`

Bank transfer for project invoices, Stripe SEPA Direct Debit for recurring
retainers, Stripe payment links for international clients and deposits.

**Why:** Stripe fees on a €5,000 project invoice are €75–150 against €0 for a
transfer, and German B2B clients expect a transfer. But collecting a monthly
retainer by bank transfer means chasing the client every month forever; SEPA
Direct Debit solves that at a small fraction of card fees.

**Architectural consequence, applied from day one:** no `is_paid` boolean;
invoice status derived from summed payments; `payment_method` on the payment.
This is what lets Stripe be added later without a rewrite.

---

### D6 — Referral system, tracked but never automated

`referrers` → `leads.referrer_id` → `referral_payouts`.
Suggested terms: 10% of the first engagement, capped around €500, becoming due
only after the client has paid.

**Why the cap and the percentage:** engagement values range from a €500 landing
page to a €15,000 custom system, so a flat fee misprices both ends. Due-after-
payment prevents paying commission on an uncollected invoice.

**Hard boundary:** the platform records what is owed. It never transfers money.
The commission is a business expense requiring a proper document from the
referrer, or a Gutschrift issued to them.

---

### D7 — Trilingual marketing, single-language blog posts

Marketing pages carry de/en/ar translations. Each blog post is written in one
language and tagged with it.

**Why:** marketing pages are a finite set. Blog posts are not, and requiring
three versions of every article triples the content burden permanently.

---

### D8 — `platform` branch, then cutover, then incremental on `main`

Phases 0 and 1 land on a long-lived `platform` branch in this repository. After
the public site reaches parity, it merges to `main`. Everything after that ships
incrementally.

**Why:** the first foundation slice breaks the running site, so it cannot ship
incrementally. But a fresh repository would discard git history and the existing
`docs/services/` material for no gain, since the deployment target is changing
regardless.

---

### D9 — GSAP first; WebGL only where it earns its place

Status: **Superseded by D15** for the motion layer. The WebGL boundary below
still applies.

GSAP + ScrollTrigger + Lenis for the motion layer. GSAP's plugins are now free.

**Why:** Three.js costs bundle size, LCP, and mobile battery, and complicates
SSR and RTL. If a WebGL moment is wanted, it is a single lazy-loaded hero
element, disabled on mobile and under `prefers-reduced-motion`. A services site
that converts beats a demo reel.

---

### D10 — PostHog Cloud EU; do not rebuild its dashboard

Business numbers come from this database. PostHog answers traffic questions. A
handful of PostHog metrics are cached server-side into the admin overview; deep
analysis links out.

**Why:** EU region and a real consent banner are not optional in Germany, and
rebuilding analytics UI that already exists is wasted work.

---

### D11 — Lead conversations, not a mail client

The admin shows every lead with its notes and its email thread. Replies are sent
from the admin through Resend; inbound replies are threaded onto the lead via an
inbound-email webhook.

**Why:** the requirement is "see the conversation without leaving the
dashboard," which the lead thread satisfies. Building an IMAP client — folder
sync, arbitrary threading, attachments, deliverability, spam — is a large
product that Gmail already does better, and it is out of scope.

**Phasing:** v1 is outbound-only with notes and status. Inbound threading is a
later slice.

---

### D12 — Editable content, not a page builder

A defined set of content keys is editable from the admin: headlines, body copy,
service descriptions, CTA labels, meta text. Page structure, section order, and
layout stay in code.

**Why:** "make the text changeable" is satisfied by editable keys. Drag-and-drop
layout editing is a separate product that takes months, produces worse design
than hand-built pages, and would be used perhaps twice a year.

---

### D13 — Booking is the primary CTA; the contact form stays visible

The primary call to action is booking a call. A contact form remains available
as a clearly offered secondary path, and both create a `lead`.

**Why:** at these deal sizes a call happens regardless — a form only delays it
by several email exchanges. Booking links produce fewer submissions but far
higher-quality ones.

**How the operator's preference is respected:** the booking form collects
qualifying answers first — project type, budget band, timeline, what they
already have. Every call is then entered with the context already known, which
addresses the real concern (going into a call cold) rather than avoiding calls.

---

### D14 — Cloudinary for images

**Why:** free tier is sufficient, automatic resizing and modern formats come for
free, and the integration already exists in `prime-estate` and can be ported.

**Data boundary:** project screenshots and blog images are not personal data.
Client records, leads, and invoices never leave the German server.

---

### D15 — Motion layer removed; CSS-only baseline

Status: **Superseded by D16.** The removal happened and was the right call; the
replacement it asked for is now decided.

The GSAP + ScrollTrigger + Lenis layer from B2 was removed on 8 Sep 2026.
The public site keeps only its CSS animations (hero fade-up, blob morph and
glow, typed cursor, live dot, dark-mode button glow, theme cross-fade) and one
`usePrefersReducedMotion` hook for the typed line and the carousel.

**Why:** the layer had caused a crash on every client-side navigation away
from the home page (ScrollTrigger's pin reverted after React removed the
node), pinned and scrubbed a story section the owner had not approved, and
put scroll reveals on every section before any animation direction had been
chosen. Removing it leaves a clean baseline the owner can react to.

**What comes next:** a dedicated session decides the animation direction from
the owner's references (21st.dev, Dribbble): scroll reveals, hover
micro-interactions, page transitions, hero choreography, and whatever else
the references suggest. The tool (CSS, Motion, or GSAP again) is chosen after
that, deliberately. Until then no scroll-driven library ships.

**Still valid from D9:** WebGL stays out unless one moment earns it.

---

### D16 — The motion layer returns, without an animation library

The animation direction was chosen with the owner on 8 Sep 2026 from a live
prototype and their own references (three Dribbble portfolio shots and the JS
Mastery GSAP course). What ships: a choreographed hero entrance, section titles
that arrive word by word, cards and lists that rise in sequence once, four
tilted `Ablauf` cards joined by a line that draws itself, a 3D tilt with a blue
pointer light on cards and on the portrait, magnetic primary buttons, and a
soft page transition with a line under the header.

Built with CSS plus `IntersectionObserver`, `ResizeObserver`, and pointer
events. No GSAP, no Lenis, no library at all.

**Why no library:** every effect on the list is reachable with a transition and
a class, so a library would have bought easing sugar for roughly thirty-five
kilobytes on every visit. The owner chose this deliberately after being shown
both options; they had a standing reason to want GSAP, which is the library in
the course they follow.

**Explicitly rejected**, after the owner tried each one in the prototype: a
preloader, a custom cursor, smooth scrolling, pinned and scrubbed sections,
horizontal scroll, a marquee, and counting numbers. The last one has no honest
input — there are three projects and one person, and animating those figures
would draw attention to how small they are.

**What keeps it safe:** `html.motion` gates every hidden state, is set before
first paint only for visitors who accept motion, and removes itself if the
motion module never reports in. Hover and tilt need a fine pointer. The
`Ablauf` tilt and its line survive reduced motion because they are layout, not
motion.
