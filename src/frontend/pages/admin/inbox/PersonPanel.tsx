import { useEffect, useState } from 'react'
import { ChevronRight, Trash2 } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Textarea } from '#/frontend/components/ui/textarea'
import {
  useAddNote,
  useDeleteNote,
  useUpdatePerson,
} from '#/frontend/features/inbox/inbox-queries'
import { LANGUAGE_LABEL, formatDateTime } from '#/frontend/features/inbox/inbox-format'
import { INBOX_LANGUAGES, type InboxLanguage } from '#/shared/validation/inbox.validation'
import type { Person } from '#/shared/types/inbox.types'
import { cn } from '#/frontend/lib/utils'

/**
 * Who this is, and what the owner wants to remember about them.
 *
 * Folded, and **below** the thread — nothing may sit between him and the
 * cursor. Five fields, because that is what he asked for: *"name, email, phone
 * and some information about him"*. What they spent and which service they
 * chose come later, if ever.
 */
export function PersonPanel({ person }: { person: Person }) {
  return (
    <div className="border-border mt-2 border-t">
      <Section title="Details" count={person.phone ? 4 : 3} defaultOpen={false}>
        <Details person={person} />
      </Section>

      <Section title="Notes" count={person.notes.length} defaultOpen={person.notes.length > 0}>
        <Notes person={person} />
      </Section>

    </div>
  )
}

function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="border-border border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover:bg-muted/50 flex w-full items-center gap-2 px-4 py-3 text-start transition-colors"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn('text-muted-foreground size-4', open && 'rotate-90')}
        />
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
      </button>

      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  )
}

function Details({ person }: { person: Person }) {
  const save = useUpdatePerson(person.id)
  const [form, setForm] = useState({
    name: person.name,
    email: person.email,
    phone: person.phone ?? '',
    company: person.company ?? '',
    language: person.language as InboxLanguage,
  })

  // The person can change under us — an inbound letter refetches them — so the
  // form follows the record rather than holding a stale copy.
  useEffect(() => {
    setForm({
      name: person.name,
      email: person.email,
      phone: person.phone ?? '',
      company: person.company ?? '',
      language: person.language,
    })
  }, [person])

  const dirty =
    form.name !== person.name ||
    form.email !== person.email ||
    form.phone !== (person.phone ?? '') ||
    form.company !== (person.company ?? '') ||
    form.language !== person.language

  const field = (key: keyof typeof form, label: string, type = 'text', ltr = false) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`person-${key}`} className="text-xs">
        {label}
      </Label>
      <Input
        id={`person-${key}`}
        type={type}
        dir={ltr ? 'ltr' : 'auto'}
        value={form[key]}
        onChange={(event) => setForm((current) => ({ ...current, [key]: event.currentTarget.value }))}
        className="h-9 text-sm"
      />
    </div>
  )

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate(form)
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {field('name', 'Name')}
        {field('email', 'Email', 'email', true)}
        {field('phone', 'Phone', 'tel', true)}
        {field('company', 'Company')}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium">Write to them in</span>
        <div className="flex flex-wrap gap-1.5">
          {INBOX_LANGUAGES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setForm((current) => ({ ...current, language: value }))}
              aria-pressed={form.language === value}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                form.language === value
                  ? 'border-primary bg-primary text-primary-foreground font-medium'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {LANGUAGE_LABEL[value]}
            </button>
          ))}
        </div>
      </div>

      {/* The button appears only when something changed: a Save that is always
          there invites a click that does nothing. */}
      {dirty ? (
        <Button type="submit" size="sm" className="self-start" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      ) : null}
    </form>
  )
}

function Notes({ person }: { person: Person }) {
  const [body, setBody] = useState('')
  const add = useAddNote(person.id)
  const remove = useDeleteNote(person.id)

  return (
    <div className="flex flex-col gap-3">
      {person.notes.map((note) => (
        <div key={note.id} className="border-border flex gap-2 rounded-lg border p-3">
          <p dir="auto" className="flex-1 text-xs leading-relaxed whitespace-pre-wrap">
            {note.body}
          </p>
          <div className="flex flex-col items-end gap-1">
            <time className="text-muted-foreground text-[10px]">
              {formatDateTime(note.createdAt)}
            </time>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive size-6"
              onClick={() => remove.mutate(note.id)}
              aria-label="Remove this note"
            >
              <Trash2 aria-hidden="true" className="size-3" />
            </Button>
          </div>
        </div>
      ))}

      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (body.trim() === '') return
          add.mutate({ body: body.trim() }, { onSuccess: () => setBody('') })
        }}
      >
        <Textarea
          value={body}
          dir="auto"
          onChange={(event) => setBody(event.currentTarget.value)}
          rows={2}
          placeholder="Something to remember about this person. Never sent."
          className="text-xs"
          aria-label="New note"
        />
        {body.trim() !== '' ? (
          <Button type="submit" size="sm" variant="outline" className="self-start" disabled={add.isPending}>
            Save note
          </Button>
        ) : null}
      </form>
    </div>
  )
}

