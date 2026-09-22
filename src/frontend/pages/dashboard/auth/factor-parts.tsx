import { useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'

/**
 * The two pieces of factor setup that both the first-time enrollment and
 * Security Settings show: the QR with its manual key, and the recovery codes.
 *
 * Presentational only. Neither knows how it got its values, which is why the
 * same component serves "set this up for the first time" and "replace what you
 * had".
 */

/**
 * The `otpauth://` URI as a real QR, drawn as SVG.
 *
 * An `<img>` of a data URL would be a fixed raster that blurs on a retina
 * screen and cannot follow the theme. Squares in an SVG cost the same and stay
 * sharp. Error-correction level M is what every authenticator expects.
 */
export function TotpQr({ uri, size = 148 }: { uri: string; size?: number }) {
  const modules = useMemo(() => {
    // 0 = let the library pick the smallest version the data fits in.
    const qr = qrcode(0, 'M')

    qr.addData(uri)
    qr.make()

    const count = qr.getModuleCount()
    const cells: Array<{ x: number; y: number }> = []

    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.isDark(row, column)) cells.push({ x: column, y: row })
      }
    }

    return { count, cells }
  }, [uri])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${modules.count} ${modules.count}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code for your authenticator app. The setup key below is the same secret, in text."
      className="shrink-0 rounded-[12px] border border-[var(--dash-line)] bg-white p-2"
    >
      {modules.cells.map((cell) => (
        <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width={1} height={1} fill="#10172f" />
      ))}
    </svg>
  )
}

const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      className="dash-btn dash-btn-quiet"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        } catch {
          // A denied clipboard is not worth an error banner: the value is on
          // screen and can be selected by hand.
          setCopied(false)
        }
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  )
}

export function TotpEnrollment({
  uri,
  manualKey,
}: {
  uri: string
  manualKey: string
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <TotpQr uri={uri} />

      <div className="flex min-w-0 grow flex-col gap-3.5">
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold">Cannot scan? Type this key instead</p>
          <div className="flex items-center gap-2.5 rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-chip)] px-3 py-2.5">
            <code className="grow font-mono text-[12.5px] leading-relaxed tracking-wider break-words">
              {manualKey}
            </code>
            <CopyButton value={manualKey.replace(/\s/g, '')} label="Copy" />
          </div>
        </div>
        <p className="text-[11.5px] leading-snug text-[var(--dash-quiet)]">
          Showing this code sets nothing up. The next step is what switches it on.
        </p>
      </div>
    </div>
  )
}

/**
 * The codes, shown once.
 *
 * `onAcknowledge` is required rather than optional: every place that can show
 * these has to make the owner say they saved them, because no screen can show
 * them again.
 */
export function RecoveryCodeList({
  codes,
  onAcknowledge,
  acknowledgeLabel,
}: {
  codes: string[]
  onAcknowledge?: () => void
  acknowledgeLabel?: string
}) {
  const [saved, setSaved] = useState(false)
  const asText = codes.join('\n')

  const download = () => {
    const blob = new Blob(
      [
        'Dashboard recovery codes\n',
        'Each code signs you in once, then stops working.\n\n',
        `${asText}\n`,
      ],
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = 'dashboard-recovery-codes.txt'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="dash-slab grid grid-cols-2 gap-x-6 gap-y-2 px-5 py-4">
        {codes.map((code, index) => (
          <li key={code} className="flex items-baseline gap-3">
            <span className="dash-num w-4 shrink-0 text-[11px] text-[var(--dash-slab-quiet)]">
              {String(index + 1).padStart(2, '0')}
            </span>
            <code className="font-mono text-sm tracking-wider">{code}</code>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2.5">
        <CopyButton value={asText} label="Copy all" />
        <button type="button" className="dash-btn dash-btn-quiet" onClick={download}>
          Download
        </button>
        <button type="button" className="dash-btn dash-btn-quiet" onClick={() => window.print()}>
          Print
        </button>
      </div>

      {onAcknowledge ? (
        <>
          <label
            htmlFor="codes-saved"
            className="flex cursor-pointer items-start gap-2.5 border-t border-[var(--dash-line)] pt-4 text-[12.5px] leading-snug"
          >
            <input
              id="codes-saved"
              type="checkbox"
              checked={saved}
              onChange={(event) => setSaved(event.target.checked)}
              className="mt-0.5 h-[17px] w-[17px] shrink-0 accent-[var(--dash-blue)]"
            />
            <span>
              I have put these somewhere safe.{' '}
              <span className="text-[var(--dash-quiet)]">
                Nobody can show them again — a new set can only replace them.
              </span>
            </span>
          </label>

          <button
            type="button"
            className="dash-btn dash-btn-primary h-11 w-full"
            disabled={!saved}
            onClick={onAcknowledge}
          >
            {acknowledgeLabel ?? 'Continue'}
          </button>
        </>
      ) : null}
    </div>
  )
}
