import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ArrowLeft, FileText, MessageSquare, Search } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { formatBytes } from '#/frontend/features/inbox/inbox-format'
import { instant, money } from '#/frontend/features/invoices/invoice-format'
import {
  invoiceQuery,
  invoicesQuery,
  sellerQuery,
  sentLettersQuery,
} from '#/frontend/features/invoices/invoice-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
import type { SentLetter } from '#/shared/types/invoice.types'
import { INVOICE_KIND_LABEL } from '#/shared/validation/invoice.validation'

/**
 * Sent — every letter that carried a document out of here.
 *
 * His question, and it is not the one the invoice list answers. The list says
 * what is owed. This says **what a client is holding.** Three months after a
 * job, "what exactly did I send him, and when?" had one place to look — the
 * conversation — and only if he remembered who it was with.
 *
 * Nothing on this page is a flag somebody set. A row exists because an
 * outgoing message exists with that file attached to it, which is the only
 * evidence this system accepts that something was sent. Two columns that
 * claimed otherwise were deleted in `0018`.
 *
 * Deliberately not a filter on the invoice list. The invoice list has one row
 * per document; this has one row per *letter*, and an invoice sent, chased and
 * sent again after a client lost it is three rows here and one there. Folding
 * them together would mean picking one of those two truths to tell.
 */

/**
 * The file as the client received it.
 *
 * The attachment, not `invoices/:id/pdf`. On a document that has since been
 * corrected those are different bytes, and the question this page answers is
 * what *they* got — which only the copy can answer.
 */
const copyUrl = (attachmentId: string): string => `/api/admin/inbox/attachments/${attachmentId}`

/**
 * One letter.
 *
 * The order of the meta line is not arbitrary. **When it went** is the fact
 * this page is opened for, so it comes first and is never the thing that gets
 * truncated; the filename is last and disappears entirely on a phone, because
 * it is the least of the three and a cut-off filename helps nobody.
 *
 * The row is not itself a link. Three different things are worth reaching from
 * here — the file the client holds, the conversation it went out in, and the
 * document in the books — and hiding one of them behind the row would mean
 * picking which. The number is the third: it reads as the document's name and
 * behaves like it.
 */
function Letter({ letter }: { letter: SentLetter }) {
  const prefetch = usePrefetch()

  return (
    <div className="border-border/60 flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{letter.personName}</span>
          <span className="tabular shrink-0 text-sm font-semibold">
            {money(letter.totalCents, letter.currency)}
          </span>
        </span>

        <span className="text-muted-foreground block truncate text-xs">
          {letter.subject || 'No subject'}
        </span>

        <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-[11px]">
          <span className="shrink-0 whitespace-nowrap">{instant(letter.sentAt)}</span>

          <span aria-hidden>·</span>

          <Link
            to="/admin/invoices/$invoiceId"
            params={{ invoiceId: letter.invoiceId }}
            {...prefetch(invoiceQuery(letter.invoiceId))}
            className="hover:text-foreground shrink-0 whitespace-nowrap underline-offset-2 hover:underline"
          >
            {letter.invoiceKind === 'INVOICE' ? '' : `${INVOICE_KIND_LABEL[letter.invoiceKind]} `}
            <span className="tabular">{letter.invoiceNumber ?? 'no number'}</span>
          </Link>

          {/* Last, and gone on a phone. Knowing the file was 1.3 MB has never
              been why anyone opened this screen. */}
          <span className="hidden min-w-0 truncate sm:inline">
            · {letter.filename} ({formatBytes(letter.bytes)})
          </span>
        </span>
      </span>

      <span className="flex shrink-0 gap-1">
        {/*
          The copy, not `invoices/:id/pdf`: on a document that has since been
          corrected those are different bytes, and what *they* got is the
          question this page exists to answer.
        */}
        <Button asChild className="rounded-full" size="sm" variant="outline" title="The file they received">
          <a href={copyUrl(letter.attachmentId)} target="_blank" rel="noreferrer">
            <FileText className="size-4" />
            <span className="sr-only">Open the file that was sent</span>
          </a>
        </Button>

        <Button asChild className="rounded-full" size="sm" variant="ghost" title="The conversation it went out in">
          <Link to="/admin/inbox/$personId" params={{ personId: letter.personId }}>
            <MessageSquare className="size-4" />
            <span className="sr-only">Open the conversation</span>
          </Link>
        </Button>
      </span>
    </div>
  )
}

function LettersSkeleton() {
  return (
    <SkeletonScreen label="Loading what was sent">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          className="border-border/60 flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0"
          key={index}
        >
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="mt-2 h-3 w-56" />
            <Skeleton className="mt-2 h-2.5 w-64" />
          </div>
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
      ))}
    </SkeletonScreen>
  )
}

export function SentPage() {
  const prefetch = usePrefetch()
  const [search, setSearch] = useState('')

  const letters = useQuery(sentLettersQuery())

  /*
   * Filtered here rather than in SQL.
   *
   * The whole register is already in hand — it is a few hundred rows for a
   * one-person business — and a round trip per keystroke would make the box
   * feel slower than the list it searches. The day this is thousands of rows
   * it belongs in the query, and that day will be obvious.
   */
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase()

    if (!needle) return letters.data ?? []

    return (letters.data ?? []).filter((letter) =>
      [letter.personName, letter.subject, letter.invoiceNumber ?? '', letter.filename]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    )
  }, [letters.data, search])

  return (
    <AdminPage>
      <PageHeader
        back={
          <Button asChild className="-ms-2 w-fit rounded-full" size="sm" variant="ghost">
            <Link to="/admin/invoices" {...prefetch(invoicesQuery('ALL', ''), sellerQuery())}>
              <ArrowLeft className="size-4" /> Invoices
            </Link>
          </Button>
        }
        title="Sent"
        description="Every letter that carried a document out of here, and the file the client actually received."
      />

      <div className="relative w-full max-w-xs">
        <Search className="text-muted-foreground pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Client, subject, number, or a filename"
          className="bg-panel ps-8"
        />
      </div>

      <Panel className="overflow-hidden">
        {letters.isPending ? (
          <LettersSkeleton />
        ) : letters.isError ? (
          /* Said, rather than shown as an empty register — which would read as
             "you have never sent anything" and be a lie. */
          <PanelNote tone="error">
            <div>
              <p className="text-foreground font-medium">That could not be read.</p>
              <p className="mt-1">The register is there; this page could not reach it.</p>
            </div>
            <Button onClick={() => void letters.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </PanelNote>
        ) : rows.length === 0 ? (
          <PanelNote>
            <div>
              <p className="text-foreground font-medium">
                {search ? 'Nothing matches that.' : 'Nothing has been sent yet.'}
              </p>
              <p className="mt-1">
                {search
                  ? 'Try a different name, number or filename.'
                  : 'A row appears here the moment a letter carrying an invoice leaves the inbox.'}
              </p>
            </div>
          </PanelNote>
        ) : (
          rows.map((letter) => <Letter key={letter.attachmentId} letter={letter} />)
        )}
      </Panel>

      {rows.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          {rows.length === 1 ? '1 letter' : `${rows.length} letters`}. Each row is an outgoing
          message that really carried this file — not a button that was pressed.
        </p>
      ) : null}
    </AdminPage>
  )
}
