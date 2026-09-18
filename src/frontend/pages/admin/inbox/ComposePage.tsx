import { useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { Paperclip, Send, X } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { RichTextEditor } from '#/frontend/features/blog/RichTextEditor'
import { inboxQuery, useCompose } from '#/frontend/features/inbox/inbox-queries'
import { formatBytes, LANGUAGE_LABEL } from '#/frontend/features/inbox/inbox-format'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { INBOX_LANGUAGES, type InboxLanguage } from '#/shared/validation/inbox.validation'
import {
  emptyRichTextDoc,
  isRichTextEmpty,
  richTextToLetter,
  type RichTextDoc,
} from '#/shared/validation/rich-text'
import { cn } from '#/frontend/lib/utils'

/**
 * Writing to somebody who has never written.
 *
 * The address decides everything: if it is already in the inbox the letter
 * joins that conversation, and if it is not, the person is created — so a
 * letter is never sent into a thread the inbox cannot show afterwards.
 */
export function ComposePage() {
  const navigate = useNavigate()
  const prefetch = usePrefetch()
  const send = useCompose()

  const [to, setTo] = useState('')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [language, setLanguage] = useState<InboxLanguage>('de')
  const [doc, setDoc] = useState<RichTextDoc>(emptyRichTextDoc)
  const [pending, setPending] = useState<File[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  /*
   * Held on the client until Send is pressed.
   *
   * An attachment belongs to a person, and on this page the person may not
   * exist yet. So Send hands the letter and its files over together and the
   * server does it in one act — nothing is uploaded while he is still typing,
   * and nothing is sent if a file will not store.
   */
  const removePending = (index: number) =>
    setPending((current) => current.filter((_, i) => i !== index))

  return (
    <AdminPage width="narrow">
      <PageHeader
        title="New message"
        description="If this address is already in the inbox, the letter joins that conversation."
      />

      {/* The whole letter is one object on the canvas: the address, the
          wording, the files and Send all belong to the same act. */}
      <Panel asChild>
        <form
          className="flex flex-col gap-4 p-6"
          onSubmit={(event) => {
            event.preventDefault()

            send.mutate(
              {
                to,
                name,
                language,
                subject,
                body: richTextToLetter(doc),
                bodyRich: doc,
                attachmentIds: [],
                files: pending,
              },
              {
                onSuccess: (result) =>
                  void navigate({
                    to: '/admin/inbox/$personId',
                    params: { personId: result.personId },
                  }),
              },
            )
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="to">
                To<span className="text-destructive ms-0.5">*</span>
              </Label>
              <Input
                id="to"
                type="email"
                dir="ltr"
                required
                value={to}
                onChange={(event) => setTo(event.currentTarget.value)}
                placeholder="name@example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Their name</Label>
              <Input
                id="name"
                dir="auto"
                value={name}
                onChange={(event) => setName(event.currentTarget.value)}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              dir="auto"
              value={subject}
              onChange={(event) => setSubject(event.currentTarget.value)}
            />
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">Write in</legend>
            <div className="flex flex-wrap gap-1.5">
              {INBOX_LANGUAGES.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLanguage(value)}
                  aria-pressed={language === value}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs motion-safe:transition-colors',
                    language === value
                      ? 'border-primary bg-primary text-primary-foreground font-medium'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  {LANGUAGE_LABEL[value]}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="reply-editor flex flex-col gap-1.5">
            <span className="text-sm font-medium">Message</span>
            <RichTextEditor value={doc} language={language} onChange={setDoc} label="Message" />
          </div>

          <div className="flex flex-col gap-2">
            <input
              ref={fileInput}
              type="file"
              className="sr-only"
              aria-label="Attach a file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]

                if (file) setPending((current) => [...current, file])
                event.currentTarget.value = ''
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip aria-hidden="true" />
              Attach a file from your computer
            </Button>

            {pending.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {pending.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="border-border flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px]"
                  >
                    <Paperclip aria-hidden="true" className="size-3" />
                    <span dir="auto" className="max-w-50 truncate">
                      {file.name}
                    </span>
                    <span className="text-muted-foreground">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removePending(index)}
                      aria-label={`Remove ${file.name}`}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X aria-hidden="true" className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {/* The letter is not sent if a file will not store, so the reason has to
              be on the page rather than only in a toast that scrolls away. */}
          {send.isError ? (
            <p className="text-destructive text-sm">
              {send.error instanceof Error ? send.error.message : 'That did not send.'}
            </p>
          ) : null}

          <div className="flex gap-2">
            <Button type="submit" disabled={send.isPending || to === '' || isRichTextEmpty(doc)}>
              <Send aria-hidden="true" />
              {send.isPending ? 'Sending…' : 'Send'}
            </Button>
            {/* Cancel navigates by hand rather than as a link, so the list it
                goes back to is warmed from the button itself. */}
            <Button
              type="button"
              variant="ghost"
              onClick={() => void navigate({ to: '/admin/inbox' })}
              {...prefetch(inboxQuery('inbox', ''))}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Panel>
    </AdminPage>
  )
}
