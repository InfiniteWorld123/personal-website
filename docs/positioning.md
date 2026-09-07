# Positioning and Messaging

Owns how the business is described to visitors. Every headline, service
description, and CTA on the public site answers to this file.

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

Concrete deliverables (websites, Shopify stores, custom business systems),
a named audience (small businesses, primarily in Germany), and no unprovable
claim. It also covers all three service lines in `docs/services/` without
splitting the message.

**Business model underneath:** technical partner, not one-off vendor. This is
what makes retainers and subscriptions (phase 5) a natural continuation of the
sale rather than an upsell.

### Headline candidates

| | |
| --- | --- |
| **DE** | Ich baue die Systeme, mit denen kleine Unternehmen täglich arbeiten. |
| **EN** | I build the systems small businesses actually run on. |
| **AR** | أبني الأنظمة التي تشتغل عليها الشركات الصغيرة كل يوم. |

Alternative, more service-forward:

| | |
| --- | --- |
| **DE** | Websites, Shopify-Shops und maßgeschneiderte Systeme — gebaut, betreut, weiterentwickelt. |
| **EN** | Websites, Shopify stores, and custom systems — built, maintained, and grown with you. |
| **AR** | مواقع ومتاجر وأنظمة مخصّصة — أبنيها، وأتابعها، وأطوّرها معك. |

### Rejected directions

- **"Full-Stack Developer"** on `/` — correct on `/stack`, wrong for buyers.
- **"I grow your revenue"** — unprovable, violates the constraint above.
- **Single-niche positioning** (Shopify only, one industry only) — strongest
  conversion of all, but it contradicts three documented service lines. Revisit
  only if one line starts producing most of the income.

---

## Two audiences, two pages, two messages

| | `/` and `/services` | `/stack` |
| --- | --- | --- |
| Reader | Business owner buying a service | Company considering hiring |
| Question | "Can he build what I need?" | "Is he technically strong?" |
| Language | Outcomes, deliverables, process | Architecture, stack, decisions |
| Proof | Case studies, screenshots | This platform, code decisions |
| CTA | Book a call | Contact / CV |

Never merge these. A buyer reading architecture diagrams leaves; a hiring
manager reading service packages leaves.

---

## Page responsibilities

| Page | Single job |
| --- | --- |
| `/` | Make a stranger understand the offer and book a call |
| `/services` | Let a qualified buyer find their exact service and price band |
| `/work` | Prove capability with real projects |
| `/about` | Build trust in the person — story, method, why this work |
| `/blog` | Show thinking; earn return visits |
| `/stack` | Address companies, separately |
| `/contact` | Catch everyone the booking flow does not |

The landing page **stops** at the offer. Personal story lives on `/about`. This
split was requested and is correct: a landing page that opens with autobiography
buries the offer.

---

## Landing page structure

Ordered by what a cold visitor needs, in order:

1. **Hero** — the headline above, one supporting line, primary CTA "Book a call"
2. **What I build** — three service lines, one sentence each
3. **Selected work** — three case studies with real screenshots
4. **How it works** — the process in three or four steps. Removes the fear of
   hiring a stranger, which is the actual objection at this deal size
5. **Who this is for** — plain qualification, including who it is *not* for.
   Filtering out bad fits raises the quality of every booking
6. **About, briefly** — two sentences and a link to `/about`
7. **CTA** — book a call, with the contact form offered underneath

## Voice

- Plain language. Short sentences. No jargon on `/`, no apology on `/stack`.
- Specific over clever. "A Shopify store with German invoicing and DHL labels"
  beats "e-commerce excellence".
- First person. This is one person, and that is a strength at this size, not
  something to hide behind corporate "we".
- Never invent numbers. If there is no client count worth stating, state none.

## Editable content keys

Copy that changes without a deploy, per D12. Structure stays in code.

```text
home.hero.headline           home.hero.sub            home.hero.cta
home.services.*.title        home.services.*.body
home.process.*.title         home.process.*.body
home.audience.for            home.audience.not_for
home.cta.headline            home.cta.body
about.intro                  about.story              about.method
services.<slug>.promise      services.<slug>.body     services.<slug>.deliverables
meta.<page>.title            meta.<page>.description
```
