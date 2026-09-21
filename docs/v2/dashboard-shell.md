# Dashboard V2 — shell and Overview

Status: implemented and in the repository at `/dashboard`. This records what
exists, what is deliberately temporary, and what is still undecided. It is not
a specification for any module.

## What was built

The private V2 interface at `/dashboard`, frontend only:

- the shell — collapsible sidebar, top bar, light and dark, mobile drawer;
- the **Overview** screen, complete;
- **Invoices** — a real table with a working filter;
- **Inbox** — a two-pane mailbox where choosing a message works;
- **Settings** — real: it chooses the surface and the theme. Everything else
  on it is shape.
- **Projects, Calendar, Leads, Content, Blog** — one shared screen showing the
  shape only, each marked `Not specified yet`.

## Four surfaces

The approved direction is *Studio Workbench*, and it is built four ways. The
owner picks one in Settings and the browser remembers it.

- **Flat** (the default) — one plane divided by hairlines, 12px radius, and no
  shadow except on things that genuinely float above it.
- **Floating** — a tinted ground with the panels lifted off it, 16px radius,
  and a two-layer shadow whose wide half is the brand blue rather than grey.
  This is the shape the legacy `/admin` already had.
- **Framed** — the whole dashboard as one rounded object inset 18px from the
  window, resting on a page, with a white sidebar and the work area a shade
  below it. Below `sm` it meets the edges, because a frame on a phone spends
  width the phone does not have.
- **Detached** — the rail, the bar and the work area as three separate panels
  with 14px of page showing between them, each with its own corners and its
  own shadow. Inside the work area the panels go back to the flat treatment:
  a shadow inside a shadow reads as a card that has come loose, and the gap is
  already doing the separating. It keeps its character on a phone at 9px.

Only the ground, the fill, the radius, the shadow and the spacing differ. Every
colour that carries meaning is identical in all four, so nothing a screen
*says* depends on which is on.

It is one attribute, `data-surface`, on the same element that carries
`data-dashboard`. CSS reads it; no component branches on it except the little
drawing of each option in Settings.

## Two ways to mark the open section

Also chosen in Settings, and independent of the surface:

- **Edge bar** (the default) — a 3px bar welded to the sidebar's own edge, with
  the row tinted behind it.
- **Filled pill** — the row pulled in 12px from both sides, rounded, and filled
  with the brand colour. Collapsed, it becomes a rounded square around the icon.

Both mark the row with a *shape* as well as a colour, so neither depends on
telling the blue from the grey. On a filled pill the unread count and the
overdue dot leave the neutral palette, or they read as holes punched in the
brand colour.

### The scroll model

The dashboard fills the window and `main` scrolls inside it, rather than the
page scrolling. That is what lets a frame stay a frame, and it is also why the
rail and the bar hold their place without `position: sticky` doing it for them.
The sidebar deliberately does **not** hide its overflow: the label that slides
out of a collapsed rail is wider than the 72px rail it comes from, and hiding
overflow there cut it off.

## Where it lives

```text
src/frontend/dashboard/            tokens, shell, navigation, primitives, fixtures
src/frontend/pages/dashboard/      the screens
src/frontend/routes/dashboard*.tsx thin routes
src/tests/dashboard-*.test.*       the tests
```

`src/frontend2/` was not created. That remains a separate architecture
decision; the dashboard is a folder inside the existing frontend until one is
made.

## Isolation

Every rule in `dashboard.css` is scoped to `[data-dashboard]`, which only the
dashboard shell sets, and the whole file sits in Tailwind's `components` layer
so utilities written beside a class still win. The dashboard does not inherit
`--background`, `--card` or `--radius` from the public stylesheet, and cannot
change them.

Dark mode reuses the existing `html.dark` class and `ThemeProvider`, including
its no-flash boot script. Only the values differ; the mechanism is shared.

`/admin`, `src/backend/`, the legacy database and every public page are
untouched. Two shared files were edited, both without changing public
behaviour: the route tree (generated), and `documentLanguageFor` in
`src/frontend/i18n/language.ts`, which the document shell and
`LanguageProvider` now both call so they cannot disagree about `<html lang>`.

## Deliberately temporary

Both come out when Backend2 exists.

**The guard.** V2 has no session of its own, and authentication ownership is
still open. Rather than invent one — or ship an unguarded private surface —
`/dashboard` asks the existing admin session whether the person at the door is
the owner. It only reads. A request without a session is redirected to
`/admin/login`, which returns to `/dashboard` after signing in.

**The data.** Every figure comes from `src/frontend/dashboard/sample-data.ts`
and `sample-modules.ts`. Each screen wears the `Sample data` badge, and tests
assert that the figures agree with each other — the overdue card and the
overdue rows sum to the same number, and so do the revenue card and the paid
invoices. Replacing the fixture means changing one import per screen.

## Verified

Typecheck, 505 tests, production build. In the browser: the guard refuses a
request without a session (307) and admits one with it; the sidebar collapses
and remembers it; the rail label comes out on hover and on keyboard focus; the
invoice filter narrows the rows and the total follows; the mailbox swaps its
reading pane; the drawer opens below `lg`; no horizontal scrolling at 375px;
the surface and the active-section marker switch from Settings and survive a
reload; and an automated audit found no text below WCAG AA in any surface,
marker or theme combination that was checked.

## Still open

- Backend2: framework, architecture, database hosting, migrations.
- Authentication and sessions for V2.
- The API namespace.
- Every module's behaviour, one specification at a time.
- Whether `/dashboard` replaces `/admin`, and the cutover that would need.
- An analytics source. `Website visits` is one of the four approved Overview
  figures and nothing in the platform counts it today.
