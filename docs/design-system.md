# Design System

The visual identity is the one on yamanwarda.dev, the owner's own design:
electric blue on white, a huge uppercase display line whose first word types
itself, a serif for section titles, rounded cards with soft shadows, buttons
that lift and glow, and the portrait inside a morphing blue blob. B3 keeps
that identity and puts the new page structure, copy, and motion underneath.
The motion direction was chosen on 8 Sep 2026 from the owner's references and
is built without an animation library (`decisions.md` D16).

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
| Motion layer: reveal, tilt, magnetic buttons, word split | `src/frontend/motion/` |
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

Primary buttons are white on a blue gradient (`#2b4ffa → #4d7bff → #59a7ff`)
in both themes; in dark mode they also carry the original site's thin ring and
slow glow pulse. Cards rest on a shadow made of the brand blue rather than
neutral grey — `--shadow-card`, `--shadow-card-hover`, `--shadow-card-lit`,
defined per theme (`decisions.md` D18). The first
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
- **Buttons**: every `default` button carries the blue gradient with white
  text, lifts 2 px and glows on hover, with a diagonal glass shimmer.
  `outline` buttons lift 1.5 px and gain a blue ring. Styled globally on
  `[data-slot="button"]`; components add only shape (`rounded-full`) and size.
- **Cards** (`.work-card`, `.surface-card`, `.step`, service cards):
  `1.75rem` radius, a neutral 1 px border, a blue shadow, lift on hover. The
  border does not change under the pointer: the owner asked for no edge that
  appears on hover, so what a card gains is lift and shadow only. The gradient
  hairline D18 drew on `::before` was removed in D19.
- **Hero ground**: the dot grid on `.hero-section::after`, content above it.
  The three-pool mesh D18 put on `::before` was removed in D19.
- **Film grain**: one fixed layer on `body::after`, 4.5 % light / 7 % dark,
  under the header and under any dialog.
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

No animation library. CSS owns every transition and keyframe; JavaScript only
answers two questions — has this section entered the viewport, and where is the
pointer. See `decisions.md` D16 for why, and D15 for what came before.

`html.motion` is the single switch. The inline script in `__root.tsx` adds it
before first paint, but only when the visitor has not asked for reduced motion,
and removes it again after 2.5 s if the motion module never signals that it is
alive. Nothing is hidden without that class, so a failed script, an old
browser, or a reduced-motion setting all leave the finished page.

| What moves | How | Where |
| --- | --- | --- |
| Hero entrance: chip, greeting, headline, buttons, pills in sequence | `[data-hero-item]` + `--hero-i` | CSS only |
| Display lines rising from behind their own edge | `.hero-line` mask + `--line-i` | CSS only |
| Portrait fading and settling into place | `.hero-portrait-stage` | CSS only |
| Section titles arriving word by word | `<SplitWords>` + `--word-i` | `motion/SplitWords.tsx` |
| Cards, lists, and paragraphs rising in sequence | `[data-reveal]` + `--reveal-i` | `useReveal` |
| Cards and the portrait leaning towards the pointer, lit by a blue light | `[data-tilt]`, `--tilt-*`, `--spot-*` | `useTilt` |
| Blue buttons leaning towards the pointer and springing back | `--magnet-x/y` | `useMagneticButtons` |
| The line drawn between the four `Ablauf` cards | measured SVG + `--len`, `--delay` | `ProcessConnector` |
| Page change: the page fades in, a line runs under the header | `.route-fade`, `.route-progress` | keyed on the pathname |
| Last word of a multi-word title, in the serif's italic cut and in blue | `.split-word:last-child:not(:first-child)` | CSS only |
| Header giving up height after the first scroll | `.is-scrolled` | `useScrolled` |
| The arrow riding in a white disc that turns on hover | `[data-variant="default"] > svg` | CSS only |
| The same turn on a button with no disc | `.btn-arrow` | CSS only |
| Dot grid dissolving downwards behind the hero | `.hero-section::after` | CSS only |
| Availability badge floating on the portrait | `.hero-availability` | CSS only |
| Blob morph and glow, typed cursor, live dot, dark-mode button glow | keyframes | CSS only |
| Theme change cross-fade | View Transitions API | `theme-provider.tsx` |

`useReveal` returns a ref for a scope. The scope carries `data-reveal-scope` in
its own JSX, not from JavaScript, so the hidden state exists on the first
painted frame instead of flashing the finished layout first. Its
`[data-reveal]` descendants are numbered on mount, and the numbers become
transition delays.

### Rules

- Motion is progressive enhancement. Under `prefers-reduced-motion` nothing
  moves, and the page is complete: the `Ablauf` cards keep their tilt and the
  line between them is simply already drawn, because both are the resting
  design rather than an animation.
- Never park content at `opacity: 0` outside `html.motion [data-reveal-scope]`.
  Anything hidden must be inside a scope that will reveal it.
- Hover effects are for things a visitor can act on. The `Ablauf` cards are a
  diagram, so they do not react to the pointer at all.
- Pointer effects are gated on `(min-width: 1024px) and (pointer: fine)`; a
  tilt that never resets would leave a card crooked on a touch screen.
- A card is usually both a reveal target and a tilt target, and both want its
  `transform`. `html.motion .is-in [data-reveal]` sets `transform: none` at
  0,3,1 and outranks `html.motion [data-tilt]` at 0,2,1, so the rotation has
  to be stated a second time under `.is-in [data-tilt]` or it silently never
  applies. It did not, for a while: only the portrait tilted, because it is
  the one tilt target without `data-reveal`. The stagger belongs on the fade
  alone there — held on the transform, a card answers the pointer only after
  its own index has elapsed.
- Fourteen degrees against a 620 px perspective. Nine against 900 px, the
  first setting, rotates a wide card almost in its own plane; the owner could
  not see it. The portrait stays under the cards, at nine.
- A parent's ref is not available inside its own child's layout effect, which
  is why `ProcessConnector` measures `parentElement` instead of taking a ref
  prop. The line was silently missing until that was fixed.
- A single-word title keeps its plain form. Italicising the whole heading
  reads as a mistake rather than an accent, so the rule needs a word to lean
  against: `:last-child:not(:first-child)`.
- Arabic keeps the blue accent and drops the italic. Readex Pro has no italic
  cut, and Arabic letterforms do not slant.
- The availability badge is a claim about the owner, so it is a content key
  per language. Empty the key and the badge disappears.
- Heights that a state needs to change belong in this stylesheet, not in a
  utility class on the element. The header's compact state was written twice
  before that was true.
- WebGL stays out unless a specific moment earns it. See `decisions.md` D9.

## Verification

`bun run typecheck`, `bun run test`, `bun run build`, then in a real browser:
home, services, work, a project, about, contact, both themes, Arabic, a narrow
width, and one client-side navigation away from the home page with the console
open.
