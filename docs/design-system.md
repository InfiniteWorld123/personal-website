# Design System

The visual identity is the one already on the site. This block formalised it
into tokens and added the motion and direction layers underneath — it did not
change how anything looks. Visual direction is revisited before B3.

## Where things live

| Concern | Owner |
| --- | --- |
| Colour tokens, fonts, page CSS | `src/frontend/config/styles.css` |
| Theme state | `src/frontend/components/theme/` |
| Language and text direction | `src/frontend/i18n/` |
| Smooth scroll, GSAP, reduced motion | `src/frontend/motion/` |

## Colour

Tokens are defined on `:root` and redefined under `.dark`. Every colour is a
token; components never hardcode a hex value. The palette is unchanged:
`#355cff` primary on white in light, `#7aa2ff` on `#0c1020` in dark.

## Type

Two families, already in use: **Space Grotesk** for UI and body (`font-sans`),
**Fraunces** for display (`font-heading`).

Tailwind's own `text-*` scale still owns body copy and UI text. B2 added a
display scale on top, for headlines only:

| Utility | Use |
| --- | --- |
| `text-display-sm` | Sub-section headings |
| `text-display-md` | Section headings |
| `text-display-lg` | Page headings |
| `text-display-xl` | Hero only |

All four are fluid `clamp()` values, so headings scale with the viewport
without breakpoint jumps.

Also added: `spacing-section` / `spacing-section-lg` for consistent block
rhythm, and `ease-out-soft` / `ease-in-out-soft` shared by CSS and GSAP.

## Theme

One source of truth. `THEME_STORAGE_KEY` is read by both the inline script in
`__root.tsx` (which sets `.dark` before first paint, so there is no flash) and
by `ThemeProvider` (which owns changes after hydration).

```tsx
const { resolvedTheme, preference, setPreference, toggle } = useTheme()
```

Never toggle the `.dark` class directly — go through the provider.

## Language and direction

`LanguageProvider` owns the language and sets `document.documentElement.lang`
and `dir`. The same inline script applies both before first paint.

```tsx
const { language, direction, isRtl, setLanguage } = useLanguage()
```

Arabic renders RTL. Two rules follow from that:

- Use **logical properties** — `ms-*`/`me-*`, `ps-*`/`pe-*`, `start`/`end` —
  not `ml-*`/`mr-*`/`left`/`right`. A layout built on physical sides breaks in
  Arabic.
- Icons that imply direction (arrows, chevrons) must mirror in RTL.

## Motion

`MotionProvider` owns Lenis smooth scrolling and the GSAP ticker. Animate with
the `useGsap` hook, which scopes work to a ref and reverts on unmount:

```tsx
const sectionRef = useRef<HTMLElement>(null)

useGsap(sectionRef, () => {
  gsap.from('[data-animate]', {
    y: 24,
    opacity: 0,
    duration: 0.8,
    stagger: 0.08,
    ease: 'power3.out',
    scrollTrigger: { trigger: sectionRef.current, start: 'top 75%' },
  })
})
```

### Rules

- **Motion is progressive enhancement.** When a visitor prefers reduced motion,
  `useGsap` skips the callback entirely and Lenis is never started. The page
  must be complete and readable in that state.
- **Never park content at `opacity: 0` in CSS** and rely on an animation to
  reveal it. Animate *from* a hidden value with GSAP (`gsap.from`), so the
  resting state in the DOM is always visible.
- Register GSAP plugins through `registerMotionPlugins()`, never at module top
  level — it must not run during SSR.
- WebGL stays out unless a specific moment earns it: lazy-loaded, off on
  mobile, off under reduced motion. See `decisions.md` D9.
