# Design System

The visual identity is the one on yamanwarda.dev, the owner's own design:
electric blue on white, a huge uppercase display line whose first word types
itself, a serif for section titles, rounded cards with soft shadows, buttons
that lift and glow, and the portrait inside a morphing blue blob. B3 keeps
that identity and puts the new page structure and copy underneath; motion is a
CSS-only baseline until the animation direction is chosen (`decisions.md` D15).

Two other directions were tried and rejected on 7 Sep 2026: a quiet deep-blue
serif identity, and a flattened "calm" variant without the blob, the serif,
or the button glow. Do not reintroduce either. Change the look only after
showing a rendered mockup and getting an explicit yes.

## Where things live

| Concern | Owner |
| --- | --- |
| Colour tokens, fonts, type scale, all page CSS | `src/frontend/config/styles.css` |
| Theme preference | `src/frontend/components/theme/` |
| Language and text direction | `src/frontend/i18n/` |
| Reduced-motion hook | `src/frontend/hooks/` |
| Public shell: header, footer, container, section, portrait | `src/frontend/components/layout/public/` |
| Public copy per language | `src/frontend/content/{de,en,ar}.ts` |
| Project registry (slugs, order, links, optional images) | `src/frontend/content/site.ts` |

## Colour

Tokens are defined on `:root` and redefined under `.dark`. A `@theme inline`
block bridges every token into Tailwind utilities (`bg-primary`,
`text-muted-foreground`, `border-border`); without it those utilities compile
to nothing. Anchor defaults sit in `@layer base` so utility colours win on
links styled as buttons; an unlayered `a { color: inherit }` once painted dark
labels onto blue buttons.

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | `#ffffff`, soft blue wash at the top of the page | `#0c1020` |
| `--foreground` | `#10172f` | `#edf3ff` |
| `--primary` | `#355cff` electric blue | `#7aa2ff` (text accents only) |
| `--secondary` / `--muted` | `#edf2ff` | `#1b2540` / `#182038` |
| `--border` | 10 % ink | 14 % paper |

Primary buttons are `#355cff` with white text in both themes; in dark mode
they also carry the original site's thin ring and slow glow pulse. The first
visit follows the system theme, as the original site did; a saved preference
wins. Switching themes cross-fades the page through the View Transitions API
(instant under reduced motion or where unsupported).

## Type

Three families, self-hosted from `@fontsource` (a Google Fonts request would
transmit visitor IPs; LG München I, 3 O 17493/20):

| Role | Family | Notes |
| --- | --- | --- |
| Body, UI, hero display line | **Space Grotesk** (variable) | hero at `font-black uppercase` |
| Section and page titles | **Fraunces** (variable, optical size) | `.section-title`: tight tracking, line-height 1 |
| Arabic, all roles | **Readex Pro** (variable) | titles at 700, line-height 1.25, no tracking |

`.section-title` / `.font-heading` switch to Readex Pro under `html[lang="ar"]`.

Display scale, headlines only, fluid `clamp()` values: `text-display-sm`
(cards), `-md` (sections), `-lg` (pages), `-xl` (home hero only). `cn()` in
`lib/utils.ts` tells tailwind-merge these are font sizes; otherwise it drops
them next to a `text-*` colour. Digits in columns take `.tabular`.

Also in `@theme`: `spacing-section` / `spacing-section-lg` (`py-section`) and
`ease-out-soft` / `ease-in-out-soft` shared by CSS.

## Signature elements

- **Portrait blob** (`PortraitBlob`, `.portrait-*`): exactly the original
  composition. A white rounded frame; inside it a gradient blue blob
  (`#2f54f5 → #5a8fff → #82b6ff`, lighter in dark mode) that morphs and slowly
  turns, a flickering blue glow behind it, and the cutout portrait standing in
  front, cut at the chest by the frame's bottom edge. The cutout
  (`public/images/yaman-cutout.png`) is keyed from the grey-studio retouch
  `yaman-hero-retouched-v2.png`; the blue version stays as the OG image. Used
  on the home hero and `/about`. Stops under `prefers-reduced-motion`.
- **Typed display line** (`TypingText` in the home hero): `WEB-` / `SHOP-` /
  `SOFTWARE-` + `ENTWICKLER` in the `.hero-accent` gradient, cursor blinking.
  Reduced motion shows the first word, static. Arabic stacks the static word
  above the typed one.
- **Buttons**: every `default` button is blue with white text, lifts 2 px and
  glows on hover, with a diagonal glass shimmer. `outline` buttons lift 1.5 px
  and gain a blue ring. Styled globally on `[data-slot="button"]`; components
  add only shape (`rounded-full`) and size.
- **Cards** (`.work-card`, `.surface-card`, service cards): `1.75rem` radius,
  hairline border, soft shadow, lift on hover.
- **Chips** (`.hero-chip`, `.section-chip`): outlined pills above titles.

## Home page structure

Hero (typed line, headline sentence, sub, contact and work buttons, email,
three service pills, portrait) → services (three cards, no prices on the home
page; they live on `/services`) → projects (carousel that shows all three on
desktop) → building story (three labelled stages in normal flow; copy and
illustration still to be reviewed with the owner) → process → fit → about
teaser → closing call to action. The primary button reads "Gespräch anfragen"
/ "Request a call" / "اطلب مكالمة" everywhere. Copy is `du`-form German.

## Theme

One source of truth. `THEME_STORAGE_KEY` is read by both the inline script in
`__root.tsx` (which sets `.dark` before first paint) and by `ThemeProvider`.
The header offers light / dark / system. Never toggle `.dark` directly.

## Language and direction

The URL is the source of truth: `/de/...`, `/en/...`, `/ar/...`. The server
renders `lang` and `dir` on the first byte. `/` redirects to the `lang`
cookie, else the best `Accept-Language` match, else German. `LanguageProvider`
reads the language from the router; `setLanguage` navigates to the same page
in the other language.

Arabic renders RTL: logical properties only (`ms-*`, `pe-*`, `start`, `end`),
directional icons mirror with `rtl:-scale-x-100`, letter-spaced uppercase
labels reset with `rtl:tracking-normal`.

## Motion

The motion layer is CSS only (`decisions.md` D15). GSAP, ScrollTrigger, and
Lenis were removed on 8 Sep 2026; a new animation approach is chosen in a
dedicated session with the owner's references before any library returns.

What animates today, all in `styles.css`:

| Animation | Where |
| --- | --- |
| `fade-up` entrance (`.fade-up`, `.delay-*`) | home hero, `/about` intro |
| `blob-morph-spin`, `blob-glow-pulse` | portrait blob |
| `hero-cursor-blink` | typed display line |
| `live-pulse` | live status dot on project cards |
| `dark-button-glow` | primary buttons in dark mode |
| View Transitions cross-fade (`.theme-switching`) | theme switch |
| Hover transitions | buttons, cards, pills, links |

The typed hero line and the carousel's smooth scroll are the only motion
driven from React. Both read `usePrefersReducedMotion()` from
`src/frontend/hooks/use-prefers-reduced-motion.ts`, which starts `true` so the
server and the first client render agree, then follows the media query.

### Rules

- Motion is progressive enhancement. Under `prefers-reduced-motion` the
  keyframes and transitions above stop, the typed line shows its first word
  static, the carousel scrolls instantly, and the page is complete.
- Never park content at `opacity: 0` in CSS. Entrances animate *from* hidden
  to the resting state; the resting state is always the finished page.
- No scroll-driven pinning, reveals, or smooth-scroll library until the
  animation direction is decided.
- WebGL stays out unless a specific moment earns it. See `decisions.md` D9.

## Verification

`bun run typecheck`, `bun run test`, `bun run build`, then in a real browser:
home, services, work, a project, about, contact, both themes, Arabic, a narrow
width, and one client-side navigation away from the home page with the console
open.
