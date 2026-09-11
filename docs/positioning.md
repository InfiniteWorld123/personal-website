# Positioning and Messaging

Owns how the business is described to visitors. Every headline, service
description, and CTA on the public site answers to this file. Accepted
page-composition and copy-direction decisions are recorded in
[`content-decisions.md`](./content-decisions.md); the source code may lag those
decisions until an approved content implementation pass ships.

---

## The problem with "Full-Stack Developer"

It is a **job title for employers**, not a **value proposition for clients**.
A business owner does not want to hire a full-stack developer. They want a
problem solved, and they cannot evaluate a stack.

But the opposite failure is worse and far more common: "I build digital
solutions that grow your business" is the most generic sentence on the internet.
It is unprovable, forgettable, and reads as filler.

The strong middle is **concrete deliverables for a named audience**, with no
promises about their revenue.

## Constraint carried from the vision doc

> No marketing promises about results or sales that cannot be guaranteed.

This rules out revenue-lift claims, conversion percentages, ranking guarantees,
and invented client counts. It does **not** rule out confident positioning. Say
what is built and for whom, precisely. Precision reads as competence; vagueness
reads as inexperience.

---

## Recommended positioning

**Umbrella:** *I build the systems small businesses run on.*

Concrete deliverables (custom business systems, websites, online stores),
a named audience (small businesses, primarily in Germany), and no unprovable
claim. It also covers all three service lines in `docs/services/` without
splitting the message.

**Business model underneath:** technical partner, not one-off vendor. This is
what makes retainers and subscriptions (phase 5) a natural continuation of the
sale rather than an upsell.

### Current direction — B3 as built

> The implementation currently reflects the direction documented below. The
> accepted next content direction is recorded in
> [`content-decisions.md`](./content-decisions.md), especially C5–C9. Use that
> register when planning the next public-content pass; do not treat this
> historical implementation note as approval to retain older copy or sections.

The identity is a friendly, independent technical partner: professional
clarity with the owner's own energetic look (see `design-system.md`). Custom
software and websites lead; online stores remain available without positioning
Yaman as Shopify-only.

The hero opens with the greeting, then the typed display line `WEB-` /
`SHOP-` / `SOFTWARE-` + `ENTWICKLER` (`WEB` / `SHOP` / `SOFTWARE` +
`DEVELOPER`; Arabic `مطوّر` + `مواقع` / `متاجر` / `برمجيات`), then the
headline sentence “Deine Idee. Gemeinsam umgesetzt.” / “Your idea. Built
together.” / “فكرتك. نبنيها معًا.” and a supporting sentence that names custom
software and websites. Personal location is Erfurt.

### Earlier headline candidates

| | |
| --- | --- |
| **DE** | Ich baue die Systeme, mit denen kleine Unternehmen täglich arbeiten. |
| **EN** | I build the systems small businesses actually run on. |
| **AR** | أبني الأنظمة التي تشتغل عليها الشركات الصغيرة كل يوم. |

Alternative, more service-forward:

| | |
| --- | --- |
| **DE** | Websites, Online-Shops und individuelle Software für kleine Unternehmen. |
| **EN** | Websites, online stores, and custom software for small businesses. |
| **AR** | مواقع ومتاجر وأنظمة مخصّصة — أبنيها، وأتابعها، وأطوّرها معك. |

### Rejected directions

- **"Full-Stack Developer"** on `/` — correct on `/stack`, wrong for buyers.
- **"I grow your revenue"** — unprovable, violates the constraint above.
- **Single-niche positioning** (Shopify only, one industry only) — strongest
  conversion of all, but it contradicts three documented service lines. Revisit
  only if one line starts producing most of the income.

### Online stores first, Shopify second

The public offer is **Online-Shops / online stores / متاجر إلكترونية**. Shopify
is the preferred implementation for most store projects and appears in the
service detail, case studies, and search copy where platform expertise helps.
The home page sells the outcome without presenting the business as Shopify-only.

### Local root, global reach

The work is based in Erfurt and taken remotely from anywhere, in German,
English, or Arabic. Erfurt leads because it is the specific, checkable half;
"worldwide" never leads, because every freelancer claims it and it weakens
rather than strengthens trust. Prices stay in euros for everyone — a second,
cheaper tier for Arabic-speaking markets was considered and rejected, because
two prices for the same work undermines both.

The Arabic pages serve Arabic speakers in Germany, Austria, Switzerland, and
the Gulf. That is the honest reach at these price bands.

### Address and identity

German client-facing copy uses **du**: direct and friendly, but still precise.
The owner is described as a **selbstständiger Web- und Softwareentwickler aus
Erfurt**. The public site always uses first person singular, never agency "we".

---

## Two routes, two messages

| | `/` and `/services` | `/stack` |
| --- | --- | --- |
| Reader | Business owner buying a service | Technically curious reader |
| Question | "Can he build what I need?" | "What technology does he work with?" |
| Language | Outcomes, deliverables, process | A short, current technology overview |
| Proof | Case studies, screenshots | This platform and project links |
| CTA | Book a call | Email / GitHub |

Never merge these. A buyer does not need a technology list before they
understand the offer, and a technical reader does not need a service pitch.

---

## Page responsibilities

| Page | Single job |
| --- | --- |
| `/` | Make a stranger understand the offer and book a call |
| `/services` | Let a qualified buyer find their exact service and price band |
| `/work` | Prove capability with real projects |
| `/about` | Build trust in the person — story, method, why this work |
| `/blog` | Show thinking; earn return visits |
| `/faq` | Answer the objections before the visitor has to ask |
| `/stack` | Give a concise, factual technical overview |
| `/contact` | Catch everyone the booking flow does not |
| `/impressum`, `/datenschutz` | Legally required, and evidence of a real business |

The landing page **stops** at the offer. Personal story lives on `/about`. This
split was requested and is correct: a landing page that opens with autobiography
buries the offer.

---

## Landing page structure

Ordered by what a cold visitor needs, in order:

1. **Hero** — the person, a direct and human offer, and the primary CTA.
   The shared action label remains "Gespräch anfragen" / "Request a call" /
   "اطلب مكالمة" until a whole-site CTA review changes it.
2. **What I build** — the three service lines, without prices on the home page.
3. **Work** — current projects in equal treatment and with honest status. No
   premium labels, oversized featured project, fake client work, or placeholder
   screenshots.
4. **How it works** — the process in three or four steps, including how the
   relationship can continue after launch when the client needs it.
5. **FAQ** — eight shared questions in accordions, answering the practical
   hesitation that appears immediately before contact.
6. **CTA** — a low-barrier invitation to describe an idea, even if it is not
   yet a finished plan; contact and direct email stay available.

The story illustration, home-page fit/not-fit section, and brief about teaser
are not part of the approved landing-page content pass. Their purpose belongs
on dedicated pages or can be reconsidered in a later content decision.

Prices live on `/services`, after the visitor has understood the offer and seen
proof. They do not appear in the hero or home-page service cards.

## Voice

- Plain language. Short sentences. No jargon on `/`, no apology on `/stack`.
- Specific over clever. "A Shopify store with German invoicing and DHL labels"
  beats "e-commerce excellence".
- First person. This is one person, and that is a strength at this size, not
  something to hide behind corporate "we".
- Never invent numbers. If there is no client count worth stating, state none.
- Personal detail must serve the reader's professional trust, not invite
  sympathy. Use a checkable fact only when it clarifies the work, a decision,
  or the relationship; `/about` is not a biography.
- At least one opinion per page that a reader could disagree with. Perfect
  neutrality is the clearest tell that nobody wrote it.
- Do not describe infrastructure or features as done when they are only
  planned. `/stack` names only current technologies and describes the admin as
  being expanded.

## Editable content keys

Copy intended to change without a deploy in B6, per D12. B3 still reads typed
local content, not an API. Structure stays in code; this is not a page builder.
The project registry owns valid slugs and order. Adding a project requires its
facts and translations, not a component or route whitelist change. Optional
images carry dimensions and translated alternative text.

```text
home.hero.headline           home.hero.sub            home.hero.cta
home.story.title             home.story.sub            home.story.steps
home.story.demo              home.hero.lines
work.previous               work.next                 work.loadMore
work.empty                  work.shown
home.services.*.title        home.services.*.body
home.process.*.title         home.process.*.body
home.audience.for            home.audience.not_for
home.cta.headline            home.cta.body
about.intro                  about.story              about.method
services.<slug>.promise      services.<slug>.body     services.<slug>.deliverables
meta.<page>.title            meta.<page>.description
```
