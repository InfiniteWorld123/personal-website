import { Search } from 'lucide-react'
import { Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Everything the Dashboard carries up front for global search
 * (`docs/v2/search.md`): the ⌘K / Ctrl K shortcut, the field in the top bar,
 * the magnifier that replaces it on a phone, and a lazy import of the palette.
 *
 * The palette itself — results, keyboard handling, recent searches, the
 * query — lives in `SearchPalette.tsx` and is only fetched once the browser is
 * idle or the owner reaches for it. None of this is mounted outside
 * `DashboardShell`, so public pages never listen for the shortcut and never
 * load the palette.
 */

const loadPalette = () => import('./SearchPalette')
const SearchPalette = lazy(loadPalette)

type SearchPaletteControls = {
  openSearch: () => void
  preloadSearch: () => void
}

const SearchPaletteContext = createContext<SearchPaletteControls>({
  openSearch: () => {},
  preloadSearch: () => {},
})

export const useSearchPalette = () => useContext(SearchPaletteContext)

/**
 * ⌘K is left alone where it already means something or where a second modal
 * would fight the first one for focus: inside rich-text editing (the editor's
 * own link shortcut) and inside any other open dialog or drawer. From an
 * ordinary field on a page it still opens search, as in the Design Lab.
 */
export const shouldOpenOnShortcut = (event: KeyboardEvent): boolean => {
  if (event.defaultPrevented || event.altKey || event.shiftKey) return false
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return false

  const target = event.target instanceof Element ? event.target : null

  if (!target) return true
  if (target instanceof HTMLElement && target.isContentEditable) return false

  const dialog = target.closest('[role="dialog"], [role="alertdialog"]')

  return !dialog || dialog.hasAttribute('data-search-palette')
}

export function SearchPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const returnFocus = useRef<HTMLElement | null>(null)

  const openSearch = useCallback(() => {
    const active = document.activeElement

    // Remember where focus was only when opening from outside the palette.
    if (active instanceof HTMLElement && !active.closest('[data-search-palette]')) returnFocus.current = active

    setMounted(true)
    setOpen(true)
  }, [])

  const preloadSearch = useCallback(() => {
    void loadPalette().catch(() => {})
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!shouldOpenOnShortcut(event)) return

      event.preventDefault()
      openSearch()
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [openSearch])

  // Fetch the palette once the Dashboard has settled, so the first ⌘K opens
  // at once — without putting it in the Dashboard's first download.
  useEffect(() => {
    const idle = (window as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    const handle = idle ? idle(preloadSearch) : window.setTimeout(preloadSearch, 2000)

    return () => {
      const cancel = (window as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback

      if (idle && cancel) cancel(handle)
      else window.clearTimeout(handle)
    }
  }, [preloadSearch])

  const controls = useMemo(() => ({ openSearch, preloadSearch }), [openSearch, preloadSearch])

  return (
    <SearchPaletteContext.Provider value={controls}>
      {children}
      {mounted ? (
        <Suspense fallback={null}>
          <SearchPalette open={open} onOpenChange={setOpen} returnFocus={returnFocus} />
        </Suspense>
      ) : null}
    </SearchPaletteContext.Provider>
  )
}

/** ⌘K on a Mac, Ctrl K elsewhere. Decided after hydration, so the server and the first paint agree. */
function useShortcutLabel() {
  const [label, setLabel] = useState('⌘K')

  useEffect(() => {
    const platform =
      (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? ''

    if (!/mac|iphone|ipad/i.test(platform)) setLabel('Ctrl K')
  }, [])

  return label
}

/** The field in the top bar. It looks like a search box and opens the palette. */
export function SearchField() {
  const { openSearch, preloadSearch } = useSearchPalette()
  const shortcut = useShortcutLabel()

  return (
    <button
      type="button"
      onClick={openSearch}
      onPointerEnter={preloadSearch}
      onFocus={preloadSearch}
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      className="hidden h-9 w-full max-w-[360px] min-w-0 items-center gap-2.5 rounded-[9px] border border-[var(--dash-line)] bg-[var(--dash-input)] px-3 text-left text-[13px] text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] md:flex"
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      <span className="flex-1 truncate">Search the dashboard</span>
      <kbd className="rounded-md border border-b-2 border-[var(--dash-line)] px-1.5 font-sans text-[11px] font-semibold">
        {shortcut}
      </kbd>
    </button>
  )
}

/** Below `md` the field gives way to a magnifier; the palette then fills the phone. */
export function SearchIconButton() {
  const { openSearch, preloadSearch } = useSearchPalette()

  return (
    <button
      type="button"
      aria-label="Search the dashboard"
      aria-haspopup="dialog"
      onClick={openSearch}
      onPointerDown={preloadSearch}
      className="dash-btn dash-btn-ghost size-11 shrink-0 p-0 md:hidden"
    >
      <Search className="size-5" />
    </button>
  )
}
