import { Paperclip, Reply } from 'lucide-react'
import { useState } from 'react'
import {
  DashboardPage,
  Initials,
  NotSpecifiedBadge,
  PageHead,
  Panel,
  SampleBadge,
  StatusChip,
} from '#/frontend/dashboard/primitives'
import { sampleFigures, sampleMessages } from '#/frontend/dashboard/sample-data'
import { cn } from '#/frontend/lib/utils'

/**
 * A mailbox, in the shape it will have.
 *
 * Two panes on a wide screen: the thread list on the left, the message on the
 * right. Below `lg` the list becomes the page and the reading pane follows it,
 * because a two-pane mailbox squeezed onto a phone is two unusable panes.
 *
 * Choosing a message works. Nothing else does — no provider, no folders, no
 * threading, no sending, no attachments. Those are the parts of a real mailbox
 * that have to be designed before they can be built, and the badge says so.
 */
export function InboxPage() {
  const [selected, setSelected] = useState(0)
  const message = sampleMessages[selected]

  return (
    <DashboardPage className="lg:h-full lg:overflow-hidden">
      <PageHead
        eyebrow="INBOX"
        title="Inbox"
        description="Everyone who has written, and everything written back."
        aside={<SampleBadge />}
        actions={<NotSpecifiedBadge />}
        className="dash-rise dash-rise-1 shrink-0"
      />

      <div className="dash-rise dash-rise-2 mt-5 grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        {/* ── The list ─────────────────────────────────────── */}
        <Panel className="min-h-0 overflow-hidden">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--dash-line)] px-4 py-3">
            <StatusChip tone="blue" className="h-[26px] px-2.5">
              Unread {sampleFigures.unread}
            </StatusChip>
            <span className="text-xs text-[var(--dash-quiet)]">All 142</span>
            <span className="text-xs text-[var(--dash-quiet)]">Sent</span>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {sampleMessages.map((row, index) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelected(index)}
                  aria-current={index === selected ? 'true' : undefined}
                  className={cn(
                    'flex w-full items-start gap-3 border-b border-[var(--dash-soft)] px-4 py-3.5 text-left',
                    index === selected
                      ? 'bg-[var(--dash-blue-tint)]'
                      : 'hover:bg-[var(--dash-hover)]',
                  )}
                >
                  <Initials className="size-8 rounded-[10px]">{row.initials}</Initials>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                        {row.from}
                      </span>
                      <span className="dash-num shrink-0 text-[11px] text-[var(--dash-quiet)]">
                        {row.time}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px]">{row.subject}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--dash-quiet)]">
                      {row.preview}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        {/* ── The message ──────────────────────────────────── */}
        <Panel className="min-h-0 overflow-hidden">
          <div className="flex shrink-0 items-start gap-4 border-b border-[var(--dash-line)] px-6 py-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-[19px] font-semibold tracking-tight">{message.subject}</h2>
              <p className="mt-1.5 text-xs text-[var(--dash-quiet)]">
                {message.from} · {message.address} · {message.time}
              </p>
            </div>
            <button type="button" disabled className="dash-btn dash-btn-primary h-9 shrink-0">
              <Reply aria-hidden="true" className="size-4" />
              Reply
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 text-sm leading-[1.65] whitespace-pre-line">
            {message.body}
          </div>

          <div className="shrink-0 border-t border-[var(--dash-line)] p-4 sm:px-6 sm:pb-5">
            <div className="rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-input)] p-4">
              <p className="text-xs text-[var(--dash-quiet)]">
                Replying is not built. Sending, receiving and attachments need the mailbox
                specification first.
              </p>
              <div className="mt-6 flex items-center gap-2">
                <button
                  type="button"
                  disabled
                  aria-label="Attach a file"
                  className="dash-btn dash-btn-quiet size-8 p-0"
                >
                  <Paperclip aria-hidden="true" className="size-4" />
                </button>
                <span className="flex-1" />
                <button type="button" disabled className="dash-btn dash-btn-primary h-8 text-xs">
                  Send
                </button>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </DashboardPage>
  )
}
