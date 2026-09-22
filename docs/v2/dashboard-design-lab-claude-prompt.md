# Dashboard V2 Design Lab — Claude Code Handoff

Status: **historical.** This exploration was run and its result approved; the
shell it produced is live at `/dashboard` and recorded in
`docs/v2/dashboard-shell.md`. Kept because it explains why the dashboard looks
the way it does. It is not a task waiting to be done, and re-running it would
redesign a surface the owner has already accepted.

Use this entire document as the prompt and source of truth for the Dashboard V2
design exploration. Do not treat it as authorization to implement the production
dashboard, Backend2, a database, APIs, or a cutover.

## Your role

Act as a senior product designer and frontend design engineer working directly
with the owner. Your immediate job is to understand the product, ask useful
design questions, propose a detailed visual plan, and then create an isolated,
high-fidelity Dashboard Design Lab that the owner can review in the browser.

This is an approval-first design phase. Do not jump from this brief to the real
`/dashboard` implementation.

## Required first steps

Before proposing or changing anything:

1. Read `AGENTS.md` completely.
2. Read `docs/v2/foundation.md` completely.
3. Inspect the current public website and its design tokens, typography, brand
   mark, spacing, motion, and responsive behavior.
4. Inspect the legacy `/admin` UI only to understand existing vocabulary and
   available evidence. Legacy code is not the V2 specification.
5. Inspect the current routing and frontend organization before proposing where
   future Dashboard V2 code should live.
6. Check the working tree and preserve every unrelated owner change.

Do not recover deleted legacy documentation from Git history and silently use it
as a requirement. If a product decision is not present in this document or
`docs/v2/foundation.md`, it is open and must be discussed with the owner.

## Product story

The repository currently contains a public personal website and a legacy private
admin system. The owner trusts the accepted public-site design, but wants to
rebuild the private platform and the complete backend cleanly so he understands
and trusts the resulting system.

The transition is intentionally parallel:

```text
Legacy                               V2
------                               --
/admin                               /dashboard
src/backend/                         src/backend2/
legacy database                      new V2 PostgreSQL database
current public backend behavior      future Backend2 integration
```

The old and new systems must coexist until V2 is complete, verified, and ready
for an explicitly planned cutover.

## Approved platform boundaries

- The final private V2 application lives at `/dashboard`, never under `/admin`.
- New backend code will live under `src/backend2/`.
- V2 will use a new PostgreSQL database and a new migration history.
- `/admin`, `src/backend/`, and the legacy database must remain operational
  during the transition.
- Do not rename, replace, delete, redirect, or partially migrate `/admin` during
  this Design Lab.
- The public website keeps its accepted visual design and visitor experience.
- The public website will eventually use Backend2, but that integration is not
  part of this Design Lab.
- The initial dashboard is English-only.
- Arabic dashboard support is deferred.
- The public RAG-based AI assistant remains public-facing only. Do not place an
  AI assistant, AI chat panel, or AI navigation item in Dashboard V2.
- The two service-pricing PDFs under `docs/services/` must remain unchanged.
- Do not delete or consolidate configuration, environment files, dependencies,
  routes, documentation, or legacy code in this task.

## Important frontend naming rule

The owner may describe the new private UI conceptually as “Frontend2.” That does
not yet approve a physical `src/frontend2/` directory.

The only approved frontend fact is that the final private application is served
under `/dashboard`. Inspect the existing TanStack Start structure and later
propose a clean V2 frontend boundary, but do not turn that proposal into a
production architecture decision during the Design Lab.

For this task, keep the prototype isolated from the production public website,
legacy `/admin`, real authentication, and real data. State clearly where the
isolated lab lives and how it can be removed after approval.

## Current dashboard scope

The intended primary navigation is:

1. Overview
2. Projects
3. Calendar
4. Inbox
5. Leads
6. Content
7. Blog
8. Invoices

High-level meanings only:

- **Projects:** create/edit portfolio projects and control public visibility.
- **Calendar:** booking management and related operations.
- **Video calls:** associated with bookings; exact navigation is undecided.
- **Inbox:** a compact full mailbox that can send and receive email and support
  attachments. It is not just a contact-form inbox.
- **Leads:** customer-lead management; its workflow is not yet specified.
- **Content:** public-site content management; editable boundaries are not yet
  specified.
- **Blog:** article management; editor, languages, media, workflow, and
  publication rules are not yet specified.
- **Invoices:** invoicing; legal and operational rules are not yet specified.

Do not invent module workflows, entity schemas, API contracts, permissions, or
business rules to make the prototype look complete. Use only shallow visual
placeholders outside the Overview screen.

## Owner-approved visual direction

The selected baseline is **A — Studio Workbench**.

This direction should feel like the private working counterpart of the public
website: recognizably the same owner and brand, but calmer, clearer, and more
operational. It must not look like a purchased generic SaaS admin template.

The owner already approved these choices:

- Light mode is the default, with a complete dark-mode option.
- Desktop uses a persistent left sidebar plus a compact utility top bar.
- The sidebar can be opened and collapsed by the owner.
- Information density is roomy and airy, not compressed enterprise density.
- The dashboard is a sibling of the public site: same electric-blue identity,
  typography, and confidence, with less visual noise.
- Use Fraunces selectively for major page headings and Space Grotesk for UI,
  navigation, controls, tables, and data.
- Bento composition is allowed only when it improves hierarchy. Avoid a wall of
  same-sized cards.
- Motion may be visually expressive, but it must explain state changes and must
  respect `prefers-reduced-motion`.
- Design desktop-first. Mobile must support review and important actions, but it
  does not need to reproduce every desktop workflow in the first version.

## Overview content hierarchy

The Overview page must prioritize these four facts:

1. Revenue
2. Overdue invoices
3. Website visits
4. Unread messages

The Studio Workbench baseline uses this hierarchy:

```text
┌───────────────────────────────────────────────────────────────┐
│ Compact utility top bar: collapse, search, theme, alerts, New │
├───────────────────────────────────────────────────────────────┤
│ Overview                                      sample date     │
│ Calm one-line context                                         │
├─────────────────┬──────────────┬──────────────┬───────────────┤
│ Revenue         │ Overdue      │ Visitors     │ Unread        │
│ primary accent  │ urgent       │ trend        │ attention     │
├──────────────────────────────────┬────────────────────────────┤
│ Website visits / useful trend    │ Overdue invoice queue      │
│ Large analytical workspace       ├────────────────────────────┤
│                                  │ Unread inbox queue         │
└──────────────────────────────────┴────────────────────────────┘
```

The composition is a starting point, not permission to copy the first prototype
pixel for pixel. Improve it after critique while preserving its core hierarchy.

For the Design Lab, realistic sample data may be used and must be visibly marked
as sample data. Suggested sample values:

- Revenue this month: `€8,450`
- Received this week: `€1,650`
- Overdue invoices: `3`
- Outstanding amount: `€2,180`
- Website visitors: `1,284`
- Monthly visitor change: `+18%`
- Unread messages: `7`
- Messages needing a reply today: `2`

These are visual prototype values, not approved analytics definitions or
business rules.

## Visual thesis to explore

Start from the existing public identity rather than importing a new dashboard
theme:

- Electric blue should carry identity, selection, and primary action.
- Use blue with restraint so financial urgency and content priority remain
  legible.
- Light mode should feel crisp and focused rather than sterile.
- Dark mode should be designed independently, not produced by simply inverting
  colors.
- Use typography and whitespace as the primary character. Decorative gradients,
  shadows, glass effects, and background ornaments are optional and must earn
  their place.
- Give surfaces different roles through scale, spacing, borders, and grouping.
  Do not apply one radius, one shadow, and one card pattern everywhere.
- The memorable element should be the workbench composition and information
  rhythm, not decoration.

Use the current public-site blue (`#355cff`) as the initial brand reference, not
as an unquestionable final token. If you change it, show the reason and compare
the result against the accepted public website.

## Design Lab workflow

Follow these stage gates in order.

### Stage 1 — Inspect and summarize

Give the owner a concise summary of:

- the current frontend stack and routing pattern;
- the public site's visual identity relevant to the dashboard;
- the safe location and isolation method for the Design Lab;
- which legacy admin elements are useful evidence and which should not carry
  into V2;
- any conflicts or missing decisions discovered during inspection.

Do not edit source code during this stage.

### Stage 2 — Ask one focused question batch

Do not repeat decisions already recorded above. Ask only questions that would
materially change the visual system or shell behavior. Prefer a single numbered
batch that the owner can answer with short choices plus optional comments.

Useful unresolved subjects include:

1. Existing brand mark versus a simplified dashboard mark.
2. Full-width application canvas versus a slightly framed desktop workbench.
3. Exact scope of global search in the visual prototype.
4. What the global `New` action visually exposes.
5. Whether urgent work or recent activity receives the stronger secondary
   emphasis below the four overview metrics.
6. Whether the collapsed sidebar keeps tooltips, labels-on-hover, or only icons.
7. Preferred mobile navigation pattern: drawer, compact rail, or bottom bar.
8. Whether dates and numbers use German locale formatting while UI labels remain
   English.
9. Which motion moment should carry the brand: shell entrance, metric update, or
   panel transition.
10. Whether the owner wants dense tables to remain airy or switch to a compact
    mode per screen later.

If repo inspection reveals more important questions, replace weaker questions
instead of making the batch unnecessarily long.

### Stage 3 — Present the design plan before code

After the owner answers, present:

- a 4–6 color token proposal for both light and dark modes;
- typography roles and a small type scale;
- spacing, radius, border, and elevation rules;
- sidebar and top-bar behavior;
- Overview hierarchy and alignment rules;
- desktop, tablet, and mobile adaptation;
- motion principles and reduced-motion behavior;
- keyboard/focus/accessibility rules;
- a small ASCII wireframe for each breakpoint;
- a brief self-critique explaining what was changed to avoid generic SaaS
  dashboard patterns.

Wait for owner approval if the answers materially change the selected Studio
Workbench direction.

### Stage 4 — Build only the isolated Design Lab

After the plan is accepted, build a high-fidelity interactive prototype. It must
not be the production `/dashboard` implementation.

The lab should allow the owner to review at least:

- light mode and dark mode;
- expanded and collapsed sidebar;
- active navigation treatment;
- desktop Overview at the target large viewport;
- a narrower laptop/tablet layout;
- a practical mobile layout;
- meaningful hover, focus, active, loading, empty, and error examples where they
  affect the visual system;
- reduced-motion behavior;
- the primary Studio Workbench direction plus only genuinely useful refinements,
  not unrelated alternative themes.

Use mock data only. No database, auth, backend, email provider, analytics
provider, invoice generator, upload system, or external API is allowed in the
lab.

### Stage 5 — Browser critique and owner handoff

Review the actual rendered prototype with screenshots at desktop and mobile
sizes. Critique it against the brief, fix visible layout or contrast problems,
and then show the owner:

- the preview location;
- what can be toggled or tested;
- the design decisions represented;
- a short list of remaining owner choices.

Stop after the owner-facing Design Lab handoff. Do not start production
implementation until the owner explicitly approves a final design.

## Required Design Lab details

### Sidebar

- Persistent on desktop, collapsible by an explicit control.
- Expanded state shows mark, product identity, labels, and counts where useful.
- Collapsed state remains understandable, keyboard accessible, and supported by
  tooltips or another clear label mechanism.
- Navigation order follows the approved module list.
- Overview is initially active.
- Inbox may show an unread count.
- Settings and Log out may live in a separated footer group.
- Do not add an AI item.

### Top bar

- Compact and secondary to the work area.
- Includes the sidebar control.
- May prototype global search, notifications, theme control, a contextual `New`
  action, and the owner account menu.
- Do not imply finalized search behavior or menu contents when those rules are
  still open. Mark prototype-only interactions clearly in the handoff.

### Overview

- Fraunces may identify the page, not every card.
- Revenue receives the clearest positive emphasis.
- Overdue invoices use an accessible urgent treatment without making the entire
  dashboard red.
- Website visits should show a useful trend, not decoration disguised as a
  chart.
- Unread messages should make attention and next action easy to scan.
- Secondary panels should lead naturally toward the future Invoices and Inbox
  modules without pretending those modules are implemented.

### Light and dark modes

- Light is the initial default.
- Both modes use explicit tokens.
- Text, borders, focus indicators, charts, positive/urgent states, and disabled
  controls must remain distinguishable in both modes.
- Theme preference may be simulated locally in the lab. Do not design the
  production persistence mechanism yet.

### Responsive behavior

- Desktop is the primary authoring and management environment.
- Tablet/laptop widths may collapse the sidebar and simplify the metric row.
- Mobile is for review, triage, and important quick actions.
- Avoid miniature desktop tables on mobile.
- No horizontal page scrolling at supported viewport widths.
- Touch targets and text remain usable.

### Motion

- Use motion to show shell state changes, panel transitions, and updated data.
- Prefer one coordinated signature moment over animation on every card.
- No constant decorative motion.
- Hover is not the only way to reveal required information.
- `prefers-reduced-motion` must preserve meaning without movement.

## Technical boundaries for the prototype

- Preserve the existing stack and lockfile unless the isolated lab genuinely
  requires an already-approved dependency.
- Prefer the fonts, icon system, and UI primitives already installed.
- Do not install a dashboard template or copy a shadcn dashboard example as the
  final design.
- Keep prototype styles and state isolated so they cannot alter the public site
  or legacy `/admin` through global selectors or providers.
- Do not connect the prototype to `src/backend/` or create code in
  `src/backend2/`.
- Do not create a real `/dashboard` route during this lab unless the owner later
  explicitly authorizes using that route solely for the prototype.
- Do not create `src/frontend2/` without a separate architecture decision.
- Do not edit deployment configuration or publish the lab without permission.
- Do not include credentials, real client data, real messages, real invoices,
  or private attachments.
- Document every file changed for the lab and how to remove it cleanly.

## Production implementation context for later

The eventual production implementation will:

- serve the private UI under `/dashboard`;
- use Backend2 under `src/backend2/`;
- use a new database and new migration history;
- keep `/admin` and the legacy backend alive until verified cutover;
- connect the public website to Backend2 without visually redesigning it;
- receive detailed module specifications one module at a time;
- define auth, API namespaces, data contracts, migrations, permissions, and
  cutover separately.

This context is provided so the Design Lab does not create a dead-end visual
concept. It is not authorization to design or implement those systems now.

## Non-goals

This task does not include:

- production Dashboard V2 implementation;
- Backend2 implementation;
- a new database or migrations;
- authentication or session design;
- an API namespace decision;
- integration with the public website;
- detailed module behavior;
- real email, booking, video, analytics, invoice, or AI integrations;
- legacy cleanup or deletion;
- environment-file consolidation;
- deployment or cutover;
- replacing the accepted public-site design.

## Definition of done for this design phase

The Design Lab is ready for owner selection only when:

- repository and foundation inspection were completed first;
- unresolved visual decisions were asked without repeating approved answers;
- the design plan was shown before implementation;
- the result is recognizably Studio Workbench and recognizably Yaman Warda;
- the design does not read as a generic SaaS dashboard kit;
- light/dark and expanded/collapsed states work;
- desktop and mobile renders were visually reviewed;
- important focus, contrast, overflow, and reduced-motion behavior was checked;
- all values are mock data and no real backend is connected;
- `/admin`, public pages, Backend2, configuration, and unrelated files were not
  changed;
- changed files and removal steps are documented;
- Claude Code stops and waits for explicit design approval.

## Communication style

Talk to the owner in clear Arabic. Keep technical identifiers and UI labels in
English where that is clearer. Be conversational and willing to discuss the
design openly, but keep each question concrete and explain why a decision
matters. Show rendered work rather than relying only on prose.

Begin now with Stage 1 only: inspect the repository and `docs/v2/foundation.md`,
then report your findings and ask the focused Stage 2 question batch. Do not edit
the application yet.
