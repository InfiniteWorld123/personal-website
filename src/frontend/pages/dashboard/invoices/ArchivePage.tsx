import { useState } from 'react'
import { Archive, Info, Loader2 } from 'lucide-react'
import { berlinToday } from '#/backend2/contracts/invoice-dates.contract'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { saveBlob, yearArchive } from '#/frontend/features/invoices-v2/api'
import { useInvoiceMode } from '#/frontend/features/invoices-v2/mode'
import { useInvoices } from '#/frontend/features/invoices-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { Banner, SectionNav, TestBar } from './invoice-parts'

/**
 * The year for the tax adviser, approved in the Invoices Design Lab (24 Sep
 * 2026): one ZIP per year, downloaded to the owner's computer — every real
 * issued, cancelled and cancellation document as PDF, plus the documents,
 * payments and refunds as CSV. Drafts and test mode are never in it, which is
 * why the counts say how many test documents were left out. Nothing is emailed.
 */

const FIRST_YEAR = 2026

export function ArchivePage() {
  const { mode } = useInvoiceMode()
  const current = Number(berlinToday().slice(0, 4))
  const years = Array.from({ length: Math.max(1, current - FIRST_YEAR + 1) }, (_, index) => current - index)
  const [year, setYear] = useState(current)
  const [busy, setBusy] = useState(false)
  const real = useInvoices({ mode: 'live', kind: 'invoice', year, pageSize: 1 })
  const cancellations = useInvoices({ mode: 'live', kind: 'cancellation', year, pageSize: 1 })
  const tests = useInvoices({ mode: 'test', year, pageSize: 1 })
  const loading = real.isPending || cancellations.isPending || tests.isPending
  const failed = real.isError || cancellations.isError || tests.isError
  const documents = (real.data?.total ?? 0) + (cancellations.data?.total ?? 0)

  const figure = (value: number | undefined, label: string, quiet = false) => (
    <div className="rounded-[10px] border border-[var(--dash-line)] px-3.5 py-3">
      <b className={`dash-figure block text-[22px] ${quiet ? 'text-[var(--dash-quiet)]' : ''}`}>
        {value === undefined ? <span className="dash-skeleton inline-block h-5 w-8 rounded" /> : value}
      </b>
      <span className="text-[12px] text-[var(--dash-quiet)]">{label}</span>
    </div>
  )

  return (
    <DashboardPage className="inv gap-4">
      <PageHead
        eyebrow="MONEY"
        title="Tax adviser archive"
        description="One download per year for your tax adviser: every issued, cancelled and corrected invoice as PDF, and the documents, payments and refunds as spreadsheet files (CSV)."
      />
      <TestBar mode={mode} />
      <SectionNav current="archive" />

      <section className="dash-panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <label htmlFor="archive-year" className="text-[13px] font-semibold">
            Year
          </label>
          <select
            id="archive-year"
            className="dash-field h-10 w-32 px-2.5 text-[13px]"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {years.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {failed ? (
          <p role="alert" className="text-[13px] text-[var(--dash-red-ink)]">
            The counts could not be loaded. The download may still work.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {figure(real.data?.total, 'real invoices')}
          {figure(cancellations.data?.total, 'cancellation documents')}
          {figure(tests.data?.total, 'test documents — left out', true)}
        </div>

        {!loading && documents === 0 ? (
          <Banner tone="info" icon={<Info className="size-4 shrink-0" aria-hidden="true" />} title={`Nothing real to download for ${year} yet`}>
            {tests.data?.total
              ? `${year} has only test documents so far, and those never go into the archive. `
              : `No invoice was issued in ${year}. `}
            The button works as soon as the first real invoice of the year is issued.
          </Banner>
        ) : null}

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            className="dash-btn dash-btn-primary"
            disabled={busy || loading || documents === 0}
            aria-describedby="archive-note"
            onClick={async () => {
              setBusy(true)

              try {
                const file = await yearArchive(year)

                saveBlob(file.blob, file.fileName)
                notify.success(`Downloading ${file.fileName}`)
              } catch (caught) {
                notify.error(caught instanceof Error ? caught.message : 'The archive could not be made.')
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
            {busy ? 'Packing…' : `Download ${year} (.zip)`}
          </button>
          <span id="archive-note" className="text-[12px] text-[var(--dash-quiet)]">
            It downloads to your computer. Nothing is emailed.
          </span>
        </div>
      </section>
    </DashboardPage>
  )
}
