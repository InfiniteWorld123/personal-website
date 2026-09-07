# Design System

Visual direction chosen before B3: **quiet and precise**. The buyer is a small
business owner in Germany deciding whether to trust a stranger with one to
several thousand euros. Calm typography and one deep colour read as
competence; loud colour and heavy motion read as a sales funnel.

The owner's colour is blue. It stays blue, but deep and desaturated rather
than bright: the blue of a serious office, not of a developer template.

## Where things live

| Concern | Owner |
| --- | --- |
| Colour tokens, fonts, type scale, base CSS | `src/frontend/config/styles.css` |
| Theme state | `src/frontend/components/theme/` |
| Language and text direction | `src/frontend/i18n/` |
| Smooth scroll, GSAP, reduced motion | `src/frontend/motion/` |
| Public shell: header, footer, container, section | `src/frontend/components/layout/public/` |
| Public copy per language | `src/frontend/content/{de,en,ar}.ts` |

## Colour

Tokens are defined on `:root` and redefined under `.dark`. A `@theme inline`
block bridges every token into Tailwind utilities (`bg-primary`,
`text-muted-foreground`, `border-border`). Without that block the utilities
compile to nothing; do not remove it.

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | `#f5f6f8` cool off-white | `#0c111c` |
| `--foreground` | `#0f1729` ink navy | `#e7ecf5` |
| `--primary` | `#1b3a6b` deep blue | `#93b4ff` |
| `--card` / `--paper` | `#ffffff` | `#121a29` |
| `--muted` | `#eceef3` | `#161f30` |
| `--border` | 10 % ink | 12 % paper |

One accent, spent on the primary action, prices, and eyebrows. Everything else
is ink, paper, and hairlines. Components never hardcode a hex value.

## Type

Three families, all self-hosted from `@fontsource` (a Google Fonts request
would transmit visitor IPs; LG München I, 3 O 17493/20):

| Role | Family | Notes |
| --- | --- | --- |
| Headlines | **Newsreader** (variable, optical size) | weight 500, `-0.012em` tracking |
| Body and UI | **IBM Plex Sans** | 400 / 500 / 600 |
| Arabic, all roles | **IBM Plex Sans Arabic** | drawn to match Plex Sans; headlines at 600, line-height 1.3 |

`.font-heading` switches to Plex Sans Arabic automatically under
`html[lang="ar"]`, because Newsreader has no Arabic.

Display scale, headlines only, all fluid `clamp()` values:

| Utility | Use |
| --- | --- |
| `text-display-sm` | Card and sub-section headings |
| `text-display-md` | Section headings |
| `text-display-lg` | Page headings |
| `text-display-xl` | Home hero only |

Tailwind's own `text-*` scale owns body copy and UI text. Prices and any
column of digits take `.tabular`.

Also in `@theme`: `spacing-section` / `spacing-section-lg` (`py-section`) for
block rhythm, `ease-out-soft` / `ease-in-out-soft` shared by CSS and GSAP.

## Surfaces

Sections alternate between the page ground and `tone="paper"` (white, with a
hairline top and bottom). Cards are rare: the contact form and the closing
call-to-action band. Lists separate items with hairlines (`.hairline-y`,
`divide-y`), not boxes.

## Theme

One source of truth. `THEME_STORAGE_KEY` is read by both the inline script in
`__root.tsx` (which sets `.dark` before first paint) and by `ThemeProvider`.

```tsx
const { resolvedTheme, preference, setPreference, toggle } = useTheme()
```

Never toggle the `.dark` class directly.

## Language and direction

The URL is the source of truth: `/de/...`, `/en/...`, `/ar/...`. The server
renders `lang` and `dir` on the first byte; there is no client-side language
flash. `/` redirects to the `lang` cookie, else the best `Accept-Language`
match, else German. `LanguageProvider` reads the language from the router and
`setLanguage` navigates to the same page in the other language.

```tsx
const { language, direction, isRtl, setLanguage } = useLanguage()
```

Arabic renders RTL. Rules:

- Use **logical properties** (`ms-*`, `pe-*`, `start`, `end`), never `ml-*`,
  `mr-*`, `left`, `right`.
- Directional icons mirror with `rtl:-scale-x-100`.
- Letter-spaced uppercase eyebrows reset with `rtl:tracking-normal`; Arabic
  has no uppercase and does not tolerate tracking.

## Motion

`MotionProvider` owns the GSAP ticker; Lenis smooth scroll is opt-in and
currently off. Two hooks:

- `useGsap(ref, callback)` scopes GSAP work to a ref and reverts on unmount.
- `useReveal(ref)` animates every `[data-reveal]` descendant once as it
  scrolls into view: 18 px rise, fade, short stagger.

The home hero animates `[data-hero]` on load. Nothing else moves on its own.

### Rules

- Motion is progressive enhancement. Under `prefers-reduced-motion` the hooks
  skip entirely and the page is complete.
- Never park content at `opacity: 0` in CSS. Animate *from* hidden with
  `gsap.from`, so the DOM's resting state is visible.
- Register GSAP plugins through `registerMotionPlugins()`, never at module top
  level.
- WebGL stays out unless a specific moment earns it. See `decisions.md` D9.
