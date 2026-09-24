import { Suspense, lazy } from 'react'
import type { ComponentType } from 'react'

/**
 * A page in its own chunk, downloaded only where it is used.
 *
 * The booking pages and the Contact form carry the form library, and loading
 * them this way keeps it out of every other page's download. The route's
 * loader calls `preload()`, so on a navigation the code is already here and
 * nothing flashes; on the first, server-rendered load the Suspense boundary
 * keeps the server's HTML on screen until the chunk arrives. The boundary is
 * rendered either way, so server and browser always agree on the markup.
 */
export function lazyPage<Props extends object>(load: () => Promise<ComponentType<Props>>) {
  let loaded: ComponentType<Props> | undefined
  let pending: Promise<ComponentType<Props>> | undefined

  const preload = () =>
    (pending ??= load().then((component) => {
      loaded = component

      return component
    }))

  const Lazy = lazy(() => preload().then((component) => ({ default: component })))

  function Page(props: Props) {
    const Loaded = loaded

    return <Suspense fallback={null}>{Loaded ? <Loaded {...props} /> : <Lazy {...props} />}</Suspense>
  }

  return { Page, preload }
}
