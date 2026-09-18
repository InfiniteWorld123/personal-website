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

Status: **Superseded by D22** on timing, not on reasoning. The plan below is
still the intended destination; D22 records why it is not affordable yet.

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

**Reversed by D23 on 12 Sep 2026.** Kept here because the cost it names is
real and will be felt; D23 says why the owner accepted it anyway.

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

Status: **Superseded by D21.** Images are on Cloudflare R2.

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

**Five smaller refinements** were offered in the same prototype and all
accepted on the same day: the last word of a multi-word title set in the
serif's italic cut and in blue, a header that gives up height after the first
scroll, the arrow riding in a white disc that turns on hover, a dot grid
dissolving downwards behind the hero, and an availability badge on the
portrait. The badge is a claim about the owner rather than decoration, so it
lives in the content keys per language and disappears when the key is emptied.

**What keeps it safe:** `html.motion` gates every hidden state, is set before
first paint only for visitors who accept motion, and removes itself if the
motion module never reports in. Hover and tilt need a fine pointer. The
`Ablauf` tilt and its line survive reduced motion because they are layout, not
motion.

### D17 — Three optional fields on the contact form: phone, channel, one file

The owner asked for a contact form on 8 Sep 2026, not knowing the qualifying
form from D13 was already on `/kontakt`. Shown the existing form, they kept it
where it is and added three fields: a phone number, the channel they should be
reached on, and one attachment.

All three are optional. The form's job is to start a conversation, and a
visitor who only wants to write two sentences must still be able to. The
channel is a radio group rather than a select, because the answer changes what
the visitor expects to happen next and a closed list makes that look like
paperwork.

The attachment is a single file, at most 5 MB, PDF or PNG/JPG/WEBP, forwarded
as a Resend attachment on the notification mail. Both limits are enforced twice:
in the browser so the visitor learns immediately, and again in the handler,
because a form post is whatever the sender chooses to send. The filename is
stripped of its directory parts before it reaches a mail client. When browsers
report no MIME type — Safari does this for PDFs — the extension decides.

**Declined for now:** a Datenschutz consent checkbox. It was offered and the
owner did not take it. It belongs with the Impressum and Datenschutz texts,
which are still open and which they have to supply.

**Open:** `CONTACT_TO_EMAIL` was missing from the local `.env`, so every
submission answered "Contact email is not configured." It is set locally now
and must be set wherever the site is deployed.

---

### D17 — The brand mark: a Y whose stem carries the caret

The header and footer had no logo, only a placeholder: the letters `YW` set in
black inside a soft blue disc. The owner asked for a real mark on 8 Sep 2026
and answered the brief himself: an abstract mark plus the name, one logo for
all three languages, personality and meaning delegated.

Eight candidates were drawn and shown in a Logo Lab — each on white, blue and
dark, inside a mock of the real header, and at 16–40 px. He shortlisted two,
both from the same family, and a second round narrowed them to one.

**What ships:** a Y drawn in three strokes on a 48 grid at weight 5, where the
lower half of the stem is `--primary`. It reads as the initial of the name and
as a caret resting at the end of a line.

**Why not the runner-up:** the rejected variant put the caret beside the Y as a
separate vertical bar. Below roughly 24 px the gap between the two closes and
the mark reads as two letters, `YI`; the bar is also the first thing lost in a
single-colour print or an engraving. The shipped mark is one connected letter,
so the accent is a colour inside the glyph rather than a second object, and the
mark survives with the colour removed.

**Weight 5, not 4.5:** the owner chose to show the mark alone on small screens,
with no wordmark beside it to carry the weight.

**The wordmark stays** on `sm` and wider, which was Claude's recommendation and
the owner's decision: the site is a personal brand, so a visitor should not
have to leave the header to learn the name. Below `sm` the mark stands alone.

**Motion:** the arms draw, the stem drops in, the caret blinks twice and
settles — once per full page load, since the header survives client-side
navigation. Hover and keyboard focus restart the blink. Every moving part is
gated by `html.motion` and neutralised under `prefers-reduced-motion`, and the
resting state is the finished letter, so a visitor who declines motion never
sees a half-drawn stroke. Consistent with D16: no animation library.

**Icons:** `public/favicon.svg` uses a tighter viewBox so the letter fills the
tile, and switches its ink colour on `prefers-color-scheme`.
`public/app-icon.svg` is the maskable version — full-bleed blue, mark inside
the safe zone. Both are linked from the root route, along with the manifest,
which had shipped with an empty `icons` array.

**Still owed:** `apple-touch-icon.png`. iOS does not accept SVG there, and this
machine has no rasteriser (no sharp, no rsvg, no ImageMagick), so it needs a
one-off export from `app-icon.svg` at 180×180.

### D18 — Seven visual options from the Design Lab; the tilt actually tilts

The owner asked what could be done with gradients, and asked to try the ideas
rather than read about them. Eleven visual options went into a second lab, one
switch each, the same way the motion set was decided in D16. He took seven:

Gradient fill on the blue buttons; a three-pool mesh behind the hero instead of
one flat wash; a gradient hairline around cards in place of the grey border; a
gradient tile behind the service icons; card shadows made of the brand blue
rather than neutral grey; a film-grain layer at 4.5% (7% in dark); and a
glassier header — more transparent, with a saturation boost so the blue passing
underneath does not go grey.

**Not taken, and deliberately absent:** the whole display line in a gradient (it
would cancel the contrast the one typed accent word carries), hairline grid
columns, a growing line under the nav links, and a ghost number behind each
`Ablauf` step.

**The tilt bug this turned up.** The owner reported that only the portrait leans
towards the pointer; every other card showed the blue light and nothing else. He
was right, and it was a specificity collision. Cards carry both `data-reveal`
and `data-tilt`, and `html.motion .is-in [data-reveal] { transform: none }`
(0,3,1) outranks `html.motion [data-tilt]` (0,2,1). Once a section had arrived,
`none` stuck and the rotation never applied. The portrait was the only tilt
target without `data-reveal`, which is exactly why it was the only one working.

The rotation is now stated a second time at the reveal's own weight. The
stagger moves onto the fade alone: kept on the transform, a card would answer
the pointer only after its own index had elapsed.

The tilt was also too shy to see. Nine degrees against a 900px perspective
barely rotates a wide card; it is fourteen degrees against 620px now, with a
1.5% scale while the pointer is on it. The portrait went from six degrees to
nine, still under the cards.

**Removed at the owner's request:** the blue 1px ring that appeared around a
card on hover — on `.surface-card`, `.work-card`, `.contact-info-card`, and on
the lit tilt state. The gradient hairline replaces it, and it does not change
under the pointer; what a card gains on hover is lift and shadow, not an edge.

**Also tilting now:** the two `Passung` lists and the two contact info cards.
The `Ablauf` steps stay still — the owner chose no hover reaction there in D16,
and the drawn connector is measured from their corners.

---

### D19 — Two D18 layers taken back out, and one arrow gesture everywhere

Living with D18 for a day, the owner asked for two of its seven options to go:
the three-pool mesh behind the hero and the gradient hairline around the cards.
Both are deleted, not switched off. The hero keeps its dot grid, the cards fall
back to the neutral 1 px border they had before, and everything else D18 landed
— the button gradient, the icon tiles, the blue card shadows, the grain, the
glassier header, and the 3D tilt — stays exactly as it is.

**Why:** the mesh competed with the portrait's own blue blob for the same
corner of the screen, and the hairline read as a blue outline on every card at
once, which is a lot of edge for a page whose accent is supposed to be rare.

**One arrow, one gesture.** A trailing arrow now rests at `→` and turns to `↗`
under the pointer, everywhere it appears on a button: the two work-section
buttons and the contact form's submit joined the primary buttons that already
did it. `.btn-arrow` carries the turn on buttons that have no white disc.
An icon-only button linking to another site keeps a fixed `↗`, because there
the diagonal is not decoration — it says the link opens a new tab.

The turn goes the other way in Arabic. The icon is mirrored there, so the
shared `-45deg` would have sent the arrow downwards instead of outwards.

**Contact form.** The `Wie erreiche ich dich am liebsten?` question sat right on
top of its three pills: a `legend` is not laid out as a flex item, so the
fieldset's `gap` never reached it. The distance is stated on the legend itself
now. The rest of the form was re-spaced at the same time — more air between
blocks than inside a row, so the eye can tell a new question from a second
field of the same one.

**About.** Its closing call to action was a bare title and one button. It now
carries the same supporting line and second, email button as the one on the
home page — the page ends on someone who has just read a personal story, and
mail is the lower-stakes of the two ways to answer.

---

### D20 — One lift for every button, one mechanism for every arrow

The owner spotted it from two screenshots: some buttons rose under the pointer
and some did not, and an arrow turned on one button but sat still on the next.

**What was actually there.** Three lifts — `-2px` on primary, `-1.5px` on
outline, none on ghost — plus the magnetic lean on primary only. Nobody
perceives half a pixel as a decision, so it read as breakage. Worse, the arrow
had *two* mechanisms: an implicit rule that turned any icon inside a blue
button, and the explicit `.btn-arrow` from D19. Every outline button that
forgot the class stopped turning silently, which had happened on the service
cards, the about teaser, the hero's secondary button, and both text links
added with `/faq` and `/stack`.

**Decided.** Every button lifts the same `-2px`, set once on
`[data-slot="button"]:not(:disabled):hover` with no variant qualifier. The
magnetic lean stays on primary buttons alone: it is then the only movement
that separates the main action from the rest, and that difference means
something. The alternative — no lift anywhere — was prototyped and rejected;
it is consistent and it makes the page feel dead, because the lift is the cue
that says a thing is pressable.

**The implicit arrow rule is deleted.** `.btn-arrow` is now the only thing that
turns an arrow, written on the icon by hand, and it is keyed on `a:hover` /
`button:hover` so it works on text links too — a link does not lift, but its
arrow turns like every other. An arrow that stays still is now a visible
choice in the JSX rather than a forgotten class.

**Three arrows deliberately never carry it**, each for a reason: the carousel's
`←`/`→` and the back link state direction, not "go"; and an icon-only link to
another site keeps a fixed `↗`, because there the diagonal is information —
it says the link opens a new tab — and not decoration. This part of D19 stands.

**Also fixed.** The hero's secondary button rested at `↗`, which is the state
the gesture is supposed to end on, so it never had anywhere to travel. It rests
at `→` now like the rest.


---

### D21 — Cloudflare R2 for images, not Cloudinary

Status: **Accepted.** Supersedes D14.

Images go to a Cloudflare R2 bucket behind the existing backend `image-storage`
abstraction. PostgreSQL stores storage keys and metadata; responses receive
generated URLs. Resizing and format negotiation come from Cloudflare's image
transformations on the bucket's public origin, not from the application.

**Why:** the platform was already going to sit behind Cloudflare for DNS, TLS
and CDN (D22). Putting the bucket there too removes a vendor, removes an egress
bill, and keeps one dashboard instead of two. R2 charges nothing for egress,
which is the line item that eventually makes an image host expensive.

**Why the integration is small:** `src/backend/shared/image-storage/r2.ts`
signs its own SigV4 requests over `fetch`. There is no AWS SDK and no Node-only
API in the path, so the same code runs on a Worker, on a server, and in tests.

**Data boundary, unchanged from D14:** project screenshots and blog images are
not personal data. Client records, leads, and invoices stay in PostgreSQL.

**Numbering note:** `docs/design-system.md` also referenced "D21" for a
two-layer card shadow. That shadow is a refinement of D18 and was always
documented in full inside `design-system.md` itself; the stray reference has
been corrected there. D21 is this decision.

---

### D22 — Cloudflare Workers now; Hetzner when the income is steady

Status: **Accepted.** Supersedes D2.

The application deploys to Cloudflare Workers, with PostgreSQL hosted
externally in an EU region and reached through Hyperdrive. Cloudflare also
carries DNS, TLS, CDN, DDoS protection and the R2 bucket (D21). Vercel is left
behind.

**Why not Vercel, which is where the site actually runs today:** Vercel's Hobby
plan forbids commercial use, and defines it broadly enough to cover a
freelancer's own services site with a lead form. This is not a preference — the
current deployment is out of compliance and has to move regardless.

**Why not Hetzner today, which D2 chose and which is still the better
long-term home:** every cost-optimized plan — `CX23`, `CX33`, `CX43`, and the
whole ARM `CAX` family — is sold out at the time of writing. The cheapest plan
that can actually be bought is €14.27/month including VAT. The owner's income
is not yet steady, and a server that gets deleted in a lean month takes the
site, the database, and the search ranking with it. A free tier that stays up
in a month with no money is worth more than a better architecture that
intermittently does not exist.

**What was checked before accepting the platform's limits,** rather than
assumed:

- Invoice PDFs: Cloudflare's browser rendering is on the free plan, at ten
  browser-minutes per day. One invoice costs a few seconds; the roadmap implies
  tens of invoices per month, not per hour.
- Scheduled work: Cron Triggers are free, so reminders and due-date checks have
  a home. `pg-boss` is not installed and B5 has not started, so nothing is being
  rewritten — the job system is simply chosen before it is built rather than
  after.
- Revenue and analytics queries: aggregation runs inside PostgreSQL. Waiting on
  the database does not count against a Worker's CPU budget, so a heavy report
  is not a heavy Worker.

**The one limit that had to be measured, not reasoned about:** the free plan
allows 10 ms of CPU per invocation, and this application renders React on the
server.

**Measured on 11 Sep 2026**, on a real deployment at
`yamanwarda.wardayaman47.workers.dev`, read back from `wrangler tail`:

| request | CPU |
|---|---|
| `GET /en`, `GET /ar` | 16–20 ms |
| `GET /de` (cold) | 89 ms |
| `POST /api/auth/sign-in/email` | 51–137 ms |
| `GET /api/admin/me` | 52 ms |

Eight samples: 16 ms low, 137 ms high, 61 ms average. **Every request is over
the free ceiling**, and server-rendering React is why. Cloudflare tolerates
infrequent overruns, which is why all eight returned `ok`, but a Worker that
consistently exceeds the limit is terminated with error 1102.

**So the free plan does not carry this application.** The Workers Paid plan at
$5/month raises the ceiling to 30 seconds, which is not a constraint at these
numbers. That is a third of the €14.27 the server would cost, so the decision
above stands — it is simply $5 rather than $0.

**Three Worker-specific defects were found and fixed getting there**, none of
which would have appeared on a server: Elysia compiling routes with
`new Function`, the request body being read twice on the auth passthrough, and
a `pg.Pool` outliving the request that opened it. Each is commented at its
site.

**The condition that keeps this reversible, and it is not optional:**
PostgreSQL stays ordinary PostgreSQL. D1 is never used. `db/client.ts` already
routes every query through one accessor, so the move to a server is a
connection change rather than a migration. Choosing D1 would be the one
decision that makes D2 unrecoverable.

**When to revisit:** when monthly income is steady enough that €14/month is an
expense rather than a gamble — not the first month the balance happens to
cover it. At that point D2's reasoning returns intact: compute next to data,
no CPU ceiling, a simpler data-residency story for German clients, and room to
host client projects on the same box.

---

### D23 — Blog posts carry all three languages, like every other page

*12 Sep 2026. Reverses D7.*

A post is one record with one `post_translations` row per language, and it
cannot be published until German, English, and Arabic are all written — the
same rule projects follow. There is no per-post language tag and no
single-language article.

**Why:** the owner asked for it directly, having seen D7's reasoning restated.
His answer was that he translates with an assistant, so the third version is
minutes rather than an afternoon. The gain is that the blog behaves like the
rest of the site: `/ar/blog` is never an empty page, the language switcher
never dead-ends on an article, and `hreflang` on a post is true rather than
decorative.

**What D7 got right, and still does:** the marketing pages are a fixed set and
the articles are not, so this cost compounds. The place it will show is the
half-finished draft: three languages to finish means an article sits unshipped
longer than it would have. The publish check names exactly what is missing, so
the cost is at least visible rather than mysterious.

**When to revisit:** if drafts pile up unpublished because the third language
is the thing standing in the way. The escape is already shaped: the schema
holds one to three translations, and only the service's publish check demands
all three. Loosening that check is a few lines, not a migration.

---

### D24 — The article body is a stored document, not stored HTML

*12 Sep 2026.*

The owner chose a visual editor over Markdown. The body is written in Tiptap
and stored as a ProseMirror document in a `jsonb` column. It is never stored
as HTML, and nothing in the blog renders with `dangerouslySetInnerHTML`.

`shared/validation/rich-text.ts` lists every node type, every mark, and every
attribute that may exist. `features/blog/PostBody.tsx` emits a React element
per node type and returns null for anything else.

**Why not HTML:** storing HTML means sanitising it, and a sanitiser is a
deny-list that has to be kept current forever. Worse for this application
specifically, the DOM-based sanitisers need a DOM, and the site runs on
Cloudflare Workers, where there is none (D22).

A stored document inverts the problem into an allow-list. An attribute the
schema does not name is dropped on the way in; a node the renderer does not
know draws nothing on the way out. There is no markup to clean, because there
is no markup until the page is rendered.

**What it costs:** the editor and the renderer have to agree. Adding a node
type to the editor without adding it to the schema means it fails to save;
adding it to both but not the stylesheet means it saves and looks wrong. The
three files name each other in their comments for that reason.

**Also decided here:** the editor's link and image buttons check the protocol
before inserting. `javascript:` and `data:` parse as perfectly valid URLs, so
a URL check is not the test — the protocol is. The same rule runs server-side,
because the client's copy of it is a courtesy, not a boundary.

### D25

**There is no controller layer, and the documentation now says so.**

*12 Sep 2026.*

`architecture.md` described every module as `*.route.ts · *.controller.ts ·
*.service.ts`. No module has ever had a controller: `posts`, `projects`, and
now `bookings` are a route file and a service file.

The route is already thin. It parses the request with a schema from
`shared/validation`, calls one service function, and wraps the result in the
shared envelope. A controller between the two would forward arguments and
nothing else.

The owner was asked which side to correct and chose the documentation. Should
a module ever grow a genuine orchestration layer, adding one file is cheap;
adding one to every module now would be ceremony.

### D26

**The weekly schedule is stored as wall-clock minutes, not as instants.**

*12 Sep 2026.*

`availability_rules` holds `weekday` and `starts_at_minute` / `ends_at_minute`
— minutes from midnight — together with one IANA zone name, `Europe/Berlin`,
which lives in `shared/validation/booking.validation.ts` as `OWNER_TIMEZONE`.

**Why not a timestamp.** "Every Monday at 09:00" is a statement about a clock
face, not about a point on the timeline. Stored as an instant it is
09:00 + whatever offset applied on the day it was written, and on the last
Sunday in March and October Germany changes that offset. The owner's whole
working day would silently move by an hour, twice a year, and the first
symptom would be a visitor arriving when nobody is there.

**What it costs.** Every slot has to be converted from a wall-clock reading to
an instant at generation time, and two readings do not convert cleanly:

- On the spring-forward night the clock jumps 02:00 → 03:00, so 02:30 never
  happens. `instantForWallTime` returns `null` and the generator skips it.
  Offering that slot would confirm a meeting at a time that is not on anybody's
  calendar.
- On the autumn night 02:30 happens twice. The later reading is taken,
  deterministically, so the slot exists exactly once.

Both are covered in `src/tests/availability.test.ts` against the real 2026
dates. The conversion is built on `Intl` rather than a date library, because
`Intl` is already in every runtime this application uses — including a Worker
— and the project carries no date library today.

`bookings` itself stores instants, as every other table does. It is the
*rule* that is a wall clock; the booking is a moment.

### D27

**Double booking is refused by Postgres, not by application code.**

*12 Sep 2026.*

```sql
EXCLUDE USING gist (blocked_slot WITH &&) WHERE (status = 'CONFIRMED')
```

`blocked_slot` is a generated `tstzrange` over the meeting plus its buffers.
Two confirmed bookings whose spans touch cannot both exist. The loser gets
SQLSTATE `23P01`, which `booking.service.ts` turns into a 409 the visitor can
act on.

**Why not a check in the service.** Reading the calendar and then inserting is
two statements, and two visitors can interleave between them. Closing that
needs a lock — a table lock, an advisory lock, or `SERIALIZABLE` with a retry
loop — and all three are more machinery than a constraint, and all three are
one forgotten call site away from being bypassed. The constraint cannot be
bypassed, because it is not a code path.

**The service still checks the schedule before inserting**, in
`assertSlotIsOffered`. That is a different question: the constraint answers
"is this time free", the check answers "would I ever have offered this time".
A request that never opened the calendar fails the second while passing the
first, so both are needed.

**Not scoped to the booking type**, deliberately: one person cannot be on two
calls at once, whatever kind they are.

**One implementation note.** `blocked_starts_at` and `blocked_ends_at` are
ordinary columns written by the service, and only the range over them is
generated. Computing them in the generated column — `starts_at - interval` —
does not work: `timestamptz + interval` is `STABLE` rather than `IMMUTABLE`,
and Postgres refuses it in a stored generated column.

### D28

**Booking writes are serialized around the business limits that SQL cannot express alone.**

*12 Sep 2026.*

Postgres' exclusion constraint is the final authority on overlap (D27), but it
does not express the daily booking cap, matching a returning visitor to one
lead, or a one-use management token. A booking transaction therefore takes
stable advisory locks for the owner's local day and the normalized visitor
email. This makes those decisions serial across tabs and application instances
without a process-local mutex.

Public booking attempts have an atomic, shared rate budget keyed by SHA-256
digests. On the Cloudflare Worker path, the same budget also keys on the
Cloudflare-authored client IP; Node development intentionally does not trust a
spoofable forwarded header. Management-token actions have their own short
budget and lock the booking row before changing it.

The token itself expires at the booking start and is revoked on cancellation
or rescheduling. The new booking receives a new token. This limits the time in
which a leaked email URL can reveal a visitor's data or change their booking.

### D29

**The pipeline's odds are derived from the stage, never typed per lead.**

*14 Sep 2026.*

A board where every card carries a hand-entered probability produces a pipeline
figure nobody believes, because nobody remembers what last month's guesses
meant. `STAGE_WEIGHT` maps each of the seven stages to a fixed weight, and the
owner's only input is the judgement he is already making: which column a card
sits in.

The weights rise towards the sale and `LOST` is zero. `HOLD` is deliberately
low — a deal parked until January is real, but counting it at half would make a
quiet quarter look busy.

Two stages joined the five that shipped with `0004`. `PROPOSAL` is the moment a
number is on the table, which is where deals die silently while nobody chases;
folding it into `QUALIFIED` means the board cannot say who is waiting on a
price. `HOLD` takes a dormant lead out of the follow-up list without pretending
it was lost, which is what keeps that list short enough to be read.

### D30

**Every module writes the lead's history; the inbox does not own it.**

*14 Sep 2026.*

`bookings.lead_id` has pointed at the person since `0004`, and the booking
service wrote nothing into `lead_events` — the writer was a private function
inside the inbox service, so only the inbox could tell a story. Someone who
wrote, booked a call and then cancelled it read as a single line: "a message
arrived".

The writer moved to `backend/modules/leads/lead.events.ts`, which imports
nothing from the inbox. Booking creation, cancellation, rescheduling and the
admin's own cancellation all append there, inside the transaction that did the
work.

Which screen an event came from is **derived from its kind**, not stored: the
kind already knows, and a column would be one more thing a writer could get
wrong. `is_automatic` is stored, because whether a person decided something is
not derivable and is the one fact the owner must always be able to see.

### D31

**Time-based rules sweep lazily on read, not on a schedule.**

*14 Sep 2026.*

Two of the nine automation rules are about time passing rather than about a
request: a call whose hour has gone by, and a lead that has been silent for a
fortnight. The obvious implementation is a Cloudflare Cron Trigger, which needs
a deploy the owner runs himself — and the reminder emails from B5 have been
waiting on exactly that deploy since 12 Sep. Shipping the best feature of the
lead system in the same state would have meant shipping it switched off.

`runDueAutomation` is therefore called when the board or Today is read. Each
rule is one indexed statement whose `WHERE` excludes what it has already done,
so the sweep is idempotent and reading a page twice changes nothing. A cron can
call the same function later without a line changing inside it.

A rule in `suggest` mode owns no row at all. The same predicate the `auto` path
uses is evaluated on read and rendered in Today with one accept button, so
there is a single implementation of "what happens" per rule rather than two
that drift. Dismissing a suggestion pushes the follow-up date out instead of
writing a hidden "no" nobody can find later.

### D32

**An automatic close announces itself and can be undone.**

*14 Sep 2026.*

The owner chose every rule on `auto`, including the one that closes a silent
lead as `LOST`. That rule is the only one that decides something against the
owner's interest without him present, and a lead closed quietly is a client he
never learns he lost.

`leads.auto_closed_at` records that a rule rather than a person did it. Today
carries such a lead for a day with an **Undo**, the card says "Closed by a
rule", and the history line is marked automatic. Any hand-made stage change
clears the stamp, because by then he has seen it.

The automation is exactly what was asked for. The stamp is the price of being
able to trust it.

### D33

**The call happens on this site, and nothing else real-time does.**

*18 Sep 2026.*

`AGENTS.md` ruled out "real-time chat, notifications infrastructure" and
"client portals, customer logins". A video call held on the site touches the
first of those, so the boundary is amended here rather than quietly ignored.

What is now in scope: a one-to-one video call between the owner and the person
who booked it, for the length of that booking. Nothing more. The call has no
history, writes no messages to the database, and survives no longer than the
window around the meeting. Text typed during a call lives in the call and dies
with it — it is not an inbox, and it is not a chat product.

What stays out, unchanged: a chat widget on the public site, a chat anyone can
open outside a booked call, presence or read receipts, push notifications, and
any second user account. The visitor still has no login. The door is the manage
link that already carries cancel and reschedule (D-era B5): a 32-byte token in
the URL fragment, never sent to the server, that the site trades for a
two-minute ticket to one room.

The alternative was an embedded third party — Zoom, Jitsi, Whereby. Rejected:
it puts another company's name and another company's consent banner inside a
German business site, for a feature that WebRTC gives directly. Cloudflare's
TURN service covers the tenth of calls that cannot connect peer-to-peer, at
1,000 GB a month free — roughly two thousand half-hour calls, against the
twenty this site will actually hold.

The signalling lives in its own Worker (`workers/call-room/`), for the reason
the inbound-email Worker does: Nitro generates the site's Worker entry, and a
Durable Object class has to be exported from one written by hand.

### D34

**The assistant answers from a closed book, and is a product before it is a feature.**

*18 Sep 2026.*

D33 listed "a chat widget on the public site" among the things that stay out,
one day before the owner asked for exactly that. So the boundary is amended
here rather than quietly ignored, the same way D33 amended `AGENTS.md`.

What moved him is not conversion. It is that he wants to build every feature he
intends to resell, and this is the first one whose shape matches the pricing
model: a technical surcharge on top of a care tier, like booking at +30 € and
login at +30 €, against 5–15 € of monthly provider cost. The recurring line is
the business; a one-off widget would not have earned this entry.

What is in scope: a bubble on the public pages that answers questions **only
from a question-and-answer file in this repository**, in the language of the
page it sits on, and hands the visitor to the existing contact details when it
cannot. It is not a messaging surface. Nobody is on the other end, no human
ever joins, there is no presence, no read receipt, no notification, and the
visitor still has no account. D33's other exclusions all stand.

**Three guards, because the model's sentences are read as the owner's
promises.** They are enforced in code, not requested in a prompt:

1. *Closed book.* Retrieval runs first. When nothing in the file matches, the
   provider is never called — the fallback answer is returned directly. A model
   that is not asked cannot invent.
2. *No figure it was not given.* Every answer is scanned for currency amounts
   and rejected if it names one the knowledge file does not contain. The owner
   chose ranges-only pricing; this is what makes that choice true rather than
   hopeful. See `assertNoInventedMoney`.
3. *A ceiling per visitor and per address.* Chat is the first endpoint here
   whose cost scales with how much a stranger types.

**The brain is rented, and the rental is one line.** `CHAT_PROVIDER` selects an
implementation behind a two-method interface, and `off` — the default — answers
from the file alone with no network call and no key at all. This exists because
the owner cannot pay today and free tiers generally train on what they are
sent and come with no `AVV`. The combination that is actually unsafe is not
"store conversations": it is storing them *and* sending them to a free tier.
Free is therefore fine for this site and forbidden for a client's, and the
swap is a setting rather than a rewrite.

**Retention is 30 days, and the visitor is not identified.** Conversations are
stored because the owner needs to know what people ask and where the assistant
failed; that knowledge lives in this month, not in an archive. No IP address is
written, and no name or address is ever requested — if one appears it is
because the visitor typed it. Old rows are deleted on write, the way the
rate-limit table already prunes itself.

**The eleven settings are one exported object, not eleven decisions in the
code.** The owner judged them in a prototype and will change his mind about
some; more to the point, the client he sells this to will want different ones.
A behaviour that lives in `CHAT_SETTINGS` is a sold configuration. A behaviour
welded into a component is a rebuild.
