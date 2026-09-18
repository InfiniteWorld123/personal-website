import { useEffect, useRef, useState } from 'react'
import { createSwapy } from 'swapy'

/**
 * The person's file, in the order he wants to read it.
 *
 * He asked for drag-and-drop and named the library himself: *"just if you
 * would build dnd feature, then use swapy"*. Swapy's model is a **swap** —
 * each slot holds exactly one item — which is exactly right for six blocks
 * and exactly wrong for a board column holding many cards, so it is used here
 * and nowhere else.
 *
 * **React and Swapy must not both own the order.** Swapy moves real DOM nodes;
 * if a swap also changed the JSX order, React would move them back on its next
 * render and the two would fight over the same nodes. So a swap is only
 * *remembered* — the saved order is applied on the next mount, which is a
 * fresh tree with nothing to fight over.
 *
 * It is remembered in `localStorage`: this is a preference of his, on his own
 * machine, and a column in the database for "which box sits on top" would mean
 * a migration every time he changes his mind.
 */

export const BLOCK_KEYS = ['deals', 'person', 'letters', 'calls', 'files', 'history'] as const

export type BlockKey = (typeof BLOCK_KEYS)[number]

const STORAGE_KEY = 'admin.leads.blockOrder.v1'

const isOrder = (value: unknown): value is BlockKey[] =>
  Array.isArray(value) &&
  value.length === BLOCK_KEYS.length &&
  BLOCK_KEYS.every((key) => value.includes(key))

const read = (): BlockKey[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw === null ? null : JSON.parse(raw)

    return isOrder(parsed) ? parsed : [...BLOCK_KEYS]
  } catch {
    // A private window, blocked site data, or a value from an older shape.
    // The default order is always a correct answer.
    return [...BLOCK_KEYS]
  }
}

/**
 * @param ready whether the blocks are on the screen yet. The file arrives from
 * the server, so on a real page load the first render is "Loading…" and there
 * is no container to attach to — without this the effect would run once
 * against nothing and dragging would silently never work, which is only
 * invisible in a harness where the data is already in the cache.
 */
export function useBlockOrder(ready: boolean) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [order, setOrder] = useState<BlockKey[]>([...BLOCK_KEYS])

  // Read after mount, never during render: the server has no `localStorage`,
  // and a first paint that disagrees with the client is a hydration error.
  useEffect(() => setOrder(read()), [])

  // Re-created whenever the rendered order changes, so Swapy is never holding
  // a map of where things used to be.
  useEffect(() => {
    const container = containerRef.current

    if (!ready || !container) return

    const swapy = createSwapy(container, { animation: 'dynamic' })

    swapy.onSwap((event) => {
      const next = event.newSlotItemMap.asArray
        .map((entry) => entry.item)
        .filter((item): item is BlockKey => (BLOCK_KEYS as readonly string[]).includes(item))

      if (!isOrder(next)) return

      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Not being able to remember the order is no reason to refuse to
        // change it. The drag still worked; it just will not survive a reload.
      }
    })

    return () => swapy.destroy()
  }, [order, ready])

  return { containerRef, order }
}
