import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Check, MailWarning } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '#/frontend/components/ui/button'
import { Switch } from '#/frontend/components/ui/switch'
import { inboxSettingsQuery, useSaveInboxPreferences } from '#/frontend/features/inbox/inbox-queries'
import type { InboxPreferenceKey, InboxPreferences } from '#/shared/validation/lead.validation'

/**
 * The inbox ships with everything on. This page is where each piece goes away
 * again — the owner's own way of working: turn it all on, then turn off what
 * gets in the way. Every switch saves as it is flipped; there is no Save
 * button to forget.
 */
const GROUPS: Array<{
  title: string
  hint: string
  items: Array<{ key: InboxPreferenceKey; label: string; hint: string }>
}> = [
  {
    title: 'The conversation',
    hint: 'What is shown under a message, and what is sent back.',
    items: [
      { key: 'thread', label: 'Show the whole conversation', hint: 'Every reply sent and received, under the first message.' },
      { key: 'inbound', label: 'Show their replies', hint: 'Needs an inbound address on the domain. Off, the thread shows only what you sent.' },
      { key: 'snippets', label: 'Canned openings', hint: 'Three saved lines, inserted with one click.' },
      { key: 'signature', label: 'Automatic signature', hint: 'Appended to every reply, in the language it is written in.' },
      { key: 'languageHint', label: 'Suggest the reply language', hint: 'Says which language they wrote in, so an Arabic message does not get a German answer.' },
    ],
  },
  {
    title: 'The list',
    hint: 'How much each row carries before you open it.',
    items: [
      { key: 'unreadMarks', label: 'Mark unread in bold', hint: 'A dot and a heavier name on anything not opened.' },
      { key: 'initials', label: 'Initials in a circle', hint: 'Easier to pick a name out at a glance; a busier row.' },
      { key: 'relativeTime', label: 'Relative time', hint: '"2 h ago" up to a week, then the date. Off, always the date.' },
      { key: 'snippet', label: 'Two lines of the message', hint: 'Know what it is about without opening it.' },
      { key: 'badges', label: 'Budget and timeline badges', hint: 'Sort the serious ones by eye rather than by opening each.' },
      { key: 'bookings', label: 'Booked calls share the list', hint: 'Off, booked calls stay on their own page. Someone who wrote and then booked is one row either way.' },
    ],
  },
  {
    title: 'Inside a message',
    hint: 'What the reading pane shows around the text.',
    items: [
      { key: 'facts', label: 'Facts card', hint: 'Company, phone, project, budget, timeline, language.' },
      { key: 'attachment', label: 'Attachment', hint: 'The name and size of the file they sent. The file itself rides on the notification mail.' },
      { key: 'notes', label: 'Private notes', hint: 'Yours alone. Never sent, never shown to anyone.' },
      { key: 'history', label: 'History', hint: 'When it arrived, when you opened it, every status change.' },
    ],
  },
  {
    title: 'Getting through them',
    hint: 'Sorting, searching, and the keyboard.',
    items: [
      { key: 'filters', label: 'Tabs above the list', hint: 'Open, unread, new, closed, archived.' },
      { key: 'search', label: 'Search', hint: 'By name, address, or anything written in the conversation.' },
      { key: 'unreadCount', label: 'Counter in the sidebar', hint: 'A number next to Inbox from anywhere in the admin.' },
      { key: 'keyboard', label: 'Keyboard shortcuts', hint: 'j and k to move, r to reply, e to archive.' },
      { key: 'bulk', label: 'Select several', hint: 'A checkbox per row, to file a batch at once.' },
      { key: 'junk', label: 'Junk button', hint: 'Files a message away into its own tab. Nothing is ever deleted.' },
    ],
  },
]

/**
 * The prose is one flex item, not many. Written as `flex` with the words and
 * the `<code>` chips as siblings, every variable name became its own flex item
 * and the sentence came apart across the box.
 */
function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="border-border text-muted-foreground flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
      <MailWarning aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="leading-6">{children}</p>
    </div>
  )
}

function Key({ children }: { children: ReactNode }) {
  return (
    <code className="bg-muted text-foreground rounded px-1 py-0.5 text-[0.7rem] whitespace-nowrap">
      {children}
    </code>
  )
}

export function InboxSettingsPage() {
  const settings = useQuery(inboxSettingsQuery())
  const save = useSaveInboxPreferences()

  const preferences = settings.data?.preferences

  const toggle = (key: InboxPreferenceKey, value: boolean) => {
    if (!preferences) return

    save.mutate({ ...preferences, [key]: value } as InboxPreferences)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link to="/admin/inbox">
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          Back to the inbox
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Everything is on to begin with. Turn off whatever gets in the way — each switch saves
          itself.
        </p>
      </div>

      {settings.data && !settings.data.canSendMail ? (
        <Notice>
          Replies cannot be sent from here yet: <Key>RESEND_API_KEY</Key> and <Key>EMAIL_FROM</Key>{' '}
          are not set. Messages are still stored.
        </Notice>
      ) : null}

      {settings.data && !settings.data.canReceiveMail ? (
        <Notice>
          Their answers arrive in your own mailbox, not here. To bring them in, point an address on
          the domain at <Key>/api/inbound-email</Key> and set <Key>INBOUND_MAIL_ADDRESS</Key> and{' '}
          <Key>INBOUND_MAIL_SECRET</Key>.
        </Notice>
      ) : null}

      {settings.isPending ? (
        <p className="text-muted-foreground text-sm">Loading settings…</p>
      ) : settings.isError ? (
        <p className="text-destructive text-sm">{(settings.error as Error).message}</p>
      ) : preferences ? (
        <div className="flex flex-col gap-5">
          {GROUPS.map((group) => (
            <section key={group.title} className="border-border overflow-hidden rounded-xl border">
              <div className="bg-muted/50 border-border border-b px-4 py-3">
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <p className="text-muted-foreground text-xs">{group.hint}</p>
              </div>
              {group.items.map((item) => (
                <label
                  key={item.key}
                  className="border-border flex cursor-pointer items-start gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  <Switch
                    checked={preferences[item.key]}
                    onCheckedChange={(value) => toggle(item.key, value)}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{item.label}</span>
                    <span className="text-muted-foreground block text-xs leading-5">{item.hint}</span>
                  </span>
                </label>
              ))}
            </section>
          ))}
        </div>
      ) : null}

      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        {save.isPending ? 'Saving…' : save.isSuccess ? (
          <>
            <Check aria-hidden="true" className="size-3.5" />
            Saved
          </>
        ) : null}
      </p>
    </div>
  )
}
