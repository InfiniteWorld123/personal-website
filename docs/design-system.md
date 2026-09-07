# Design System

The visual identity is the one the owner built and likes: bright blue, big
uppercase display type with a typed word, the cutout portrait in front of a
morphing blue blob, rounded cards with soft shadows, glowing buttons. B3 kept
that identity and put the new page structure underneath it.

A quieter, deep-blue alternative was tried on 7 Sep 2026 and rejected by the
owner. Do not reintroduce it.

## Where things live

| Concern | Owner |
| --- | --- |
| Colour tokens, fonts, type scale, helpers | `src/frontend/config/styles.css` |
| Theme state | `src/frontend/components/theme/` |
| Language and text direction | `src/frontend/i18n/` |
| Smooth scroll, GSAP, reduced motion | `src/frontend/motion/` |
| Public shell: header, footer, container, section, portrait | `src/frontend/components/layout/public/` |
| Public copy per language | `src/frontend/content/{de,en,ar}.ts` |

## Colour

Tokens are defined on `:root` and redefined under `.dark`. A `@theme inline`
block bridges every token into Tailwind utilities (`bg-primary`,
`text-muted-foreground`, `border-border`). Without that block the utilities
compile to nothing; it was missing until B3 and is why buttons used to render
without a background. Do not remove it.

| Token | Light | Dark |
| --- | --- | --- |
| `--background` | `#ffffff`, with a soft blue wash at the top of the page | `#0c1020` |
| `--foreground` | `#10172f` | `#edf3ff` |
| `--primary` | `#355cff` electric blue | `#7aa2ff` |
| `--secondary` / `--muted` | `#edf2ff` | `#1b2540` / `#182038` |
| `--border` | 10 % ink | 14 % paper |

The blue is spent on buttons, the blob, the typed word, prices, and eyebrows.
Components never hardcode a hex value except inside the blob and glow
helpers, which are part of the identity.

## Type

Three families, self-hosted from `@fontsource` (a Google Fonts request would
transmit visitor IPs; LG München I, 3 O 17493/20):

| Role | Family | Notes |
| --- | --- | --- |
| Body, UI, and the hero display line | **Space Grotesk** (variable) | hero at `font-black uppercase` |
| Section and page titles | **Fraunces** (variable, optical size) | `.section-title`: tight tracking, line-height 1 |
| Arabic, all roles | **Readex Pro** (variable) | titles at 700, line-height 1.25, no tracking |

`.section-title` and `.font-heading` switch to Readex Pro under
`html[lang="ar"]`, because Fraunces has no Arabic.

Display scale, headlines only, all fluid `clamp()` values:

| Utility | Use |
| --- | --- |
| `text-display-sm` | Card and sub-section headings |
| `text-display-md` | Section headings |
| `text-display-lg` | Page headings |
| `text-display-xl` | Home hero only |

`cn()` in `lib/utils.ts` is configured so tailwind-merge knows these are font
sizes; otherwise it drops them next to a `text-*` colour. Prices and columns
of digits take `.tabular`.

Also in `@theme`: `spacing-section` / `spacing-section-lg` (`py-section`) for
block rhythm, `ease-out-soft` / `ease-in-out-soft` shared by CSS and GSAP.

## Signature elements

- **Portrait blob** (`PortraitBlob`, `.portrait-*`): the cutout PNG in front
  of a gradient blob that morphs and a glow that flickers. Used on the home
  hero and `/about`. Stops under `prefers-reduced-motion`.
- **Typed word** (`TypingText` in the home hero): the first display line types
  the offer in and out (`WEB-`, `SHOP-`, `SOFTWARE-` + `ENTWICKLER`), in the
  `.hero-accent` gradient. Shows the first word, static, under reduced motion.
- **Glow buttons** (`.btn-glow-primary`, `-outline`, `-icon`, `-nav`,
  `-menu`): lift on hover with a blue halo. Primary buttons carry the blue
  drop shadow.
- **Cards** (`.surface-card`, `.project-card`, `.contact-form-card`):
  `rounded-[1.75rem]`, soft shadow, hairline border, lift on hover.
- **Chips** (`.hero-chip`, `.section-chip`): small outlined pills above
  titles and in the hero.

## Theme

One source of truth. `THEME_STORAGE_KEY` is read by both the inline script in
`__root.tsx` (which sets `.dark` before first paint) and by `ThemeProvider`.
The header offers light / dark / system.

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
- Letter-spaced uppercase labels reset with `rtl:tracking-normal`; Arabic has
  no uppercase and does not tolerate tracking.

## Motion

`MotionProvider` owns the GSAP ticker; Lenis smooth scroll is opt-in and
currently off. Two hooks:

- `useGsap(ref, callback)` scopes GSAP work to a ref and reverts on unmount.
- `useReveal(ref)` animates every `[data-reveal]` descendant once as it
  scrolls into view: short rise, fade, small stagger.

The hero uses the CSS `.fade-up` entrance from the original site.

### Rules

- Motion is progressive enhancement. Under `prefers-reduced-motion` the hooks
  skip, the blob and cursor stop, and the page is complete.
- Never park content at `opacity: 0` in CSS. Animate *from* hidden with
  `gsap.from`, so the DOM's resting state is visible.
- Register GSAP plugins through `registerMotionPlugins()`, never at module top
  level.
- WebGL stays out unless a specific moment earns it. See `decisions.md` D9.
