import { useCallback, useEffect, useState } from 'react'
import type { InvoiceMode, InvoiceSettings } from '#/backend2/contracts/invoice.contract'
import { useInvoiceSettings } from './queries'

/**
 * Test mode or live mode, for the whole Invoices section.
 *
 * Live stays locked until the server says both that real invoicing is
 * switched on (`INVOICES_LIVE_ENABLED`) and that the seller details are
 * complete — the Design Lab's "the switch stays on until the list is done".
 * Until then every screen works in test mode and says so. Once live is
 * possible the owner's last choice is remembered in this browser only; the
 * server still refuses anything live it has not been told to allow.
 */

const KEY = 'dashboard.invoices.mode'

export const liveAvailable = (settings: Pick<InvoiceSettings, 'readiness'> | undefined): boolean =>
  Boolean(settings?.readiness.liveEnabled && settings.readiness.liveReady)

const readStored = (): InvoiceMode | null => {
  try {
    const value = window.localStorage.getItem(KEY)

    return value === 'live' || value === 'test' ? value : null
  } catch {
    return null
  }
}

export const useInvoiceMode = () => {
  const settings = useInvoiceSettings()
  const available = liveAvailable(settings.data)
  const [stored, setStored] = useState<InvoiceMode | null>(null)

  useEffect(() => setStored(readStored()), [])

  const setMode = useCallback((next: InvoiceMode) => {
    setStored(next)

    try {
      window.localStorage.setItem(KEY, next)
    } catch {
      // A private window: the choice lasts until the page is left.
    }
  }, [])

  const mode: InvoiceMode = available ? (stored ?? 'live') : 'test'

  return { mode, liveAvailable: available, setMode, settings }
}
