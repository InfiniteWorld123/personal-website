import { useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { ArrowRight, Paperclip, X } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Textarea } from '#/frontend/components/ui/textarea'
import type { ContactCopy } from '#/frontend/content/types'
import { site } from '#/frontend/content/site'
import { cn } from '#/frontend/lib/utils'

type Status = 'idle' | 'sending' | 'sent' | 'error'
type FieldErrors = Partial<Record<'name' | 'email' | 'message' | 'attachment', string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * One attachment, small enough to travel inside the notification mail. The
 * same two limits are enforced again on the server, because a form post is
 * whatever the sender chooses to send.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const ATTACHMENT_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const ATTACHMENT_EXTENSIONS = /\.(pdf|png|jpe?g|webp)$/i

/** Safari and a few Android browsers hand over an empty `type` for PDFs. */
export function attachmentAccepted(file: { name: string; type: string; size: number }) {
  if (file.size > MAX_ATTACHMENT_BYTES) return false
  if (file.type) return ATTACHMENT_TYPES.includes(file.type)
  return ATTACHMENT_EXTENSIONS.test(file.name)
}

/**
 * Qualifying contact form (decision D13): project type, budget band, and
 * timeline are asked up front so every conversation starts with context.
 * Phone, preferred channel, and one attachment were added in D17 — all three
 * optional, so a visitor who only wants to write a sentence still can.
 * Posts to the legacy contact endpoint until the leads module lands in B4.
 */
export function ContactForm({ copy }: { copy: ContactCopy['form'] }) {
  const [status, setStatus] = useState<Status>('idle')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [attachment, setAttachment] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const clearAttachment = () => {
    setAttachment(null)
    if (fileInput.current) fileInput.current.value = ''
  }

  const handleAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null

    if (file && !attachmentAccepted(file)) {
      setErrors((previous) => ({ ...previous, attachment: copy.errors.attachment }))
      clearAttachment()
      return
    }

    setErrors((previous) => ({ ...previous, attachment: undefined }))
    setAttachment(file)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const message = String(data.get('message') ?? '').trim()

    const nextErrors: FieldErrors = {}
    if (name.length < 2) nextErrors.name = copy.errors.name
    if (!EMAIL_PATTERN.test(email)) nextErrors.email = copy.errors.email
    if (message.length < 10) nextErrors.message = copy.errors.message
    if (attachment && !attachmentAccepted(attachment)) nextErrors.attachment = copy.errors.attachment

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setStatus('sending')

    try {
      const response = await fetch(site.contactEndpoint, { method: 'POST', body: data })

      if (!response.ok) throw new Error(`Contact endpoint returned ${response.status}`)

      setStatus('sent')
      form.reset()
      clearAttachment()
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-2xl border border-primary/15 bg-primary/5 p-8">
        <p className="section-title text-display-sm text-foreground">{copy.sent.title}</p>
        <p className="m-0 text-base leading-8 text-foreground/62">{copy.sent.body}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="contact-form flex flex-col gap-7">
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label={copy.name} htmlFor="name" error={errors.name}>
          <Input id="name" name="name" autoComplete="name" required aria-invalid={Boolean(errors.name)} />
        </Field>
        <Field label={copy.email} htmlFor="email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(errors.email)} dir="ltr" />
        </Field>
      </div>

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label={copy.company} htmlFor="company" hint={copy.companyOptional}>
          <Input id="company" name="company" autoComplete="organization" />
        </Field>
        <Field label={copy.phone} htmlFor="phone" hint={copy.phoneOptional}>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" dir="ltr" />
        </Field>
      </div>

      <ChannelChoice label={copy.preferred} options={copy.preferredOptions} />

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
        <Field label={copy.projectType} htmlFor="projectType">
          <Select id="projectType" name="projectType" options={copy.projectTypes} />
        </Field>
        <Field label={copy.budget} htmlFor="budget">
          <Select id="budget" name="budget" options={copy.budgets} />
        </Field>
        <Field label={copy.timeline} htmlFor="timeline" hint={copy.timelineHint} className="sm:col-span-2">
          <Select id="timeline" name="timeline" options={copy.timelines} />
        </Field>
      </div>

      <Field label={copy.message} htmlFor="message" hint={copy.messageHint} error={errors.message} className="message-field">
        <Textarea id="message" name="message" className="contact-message" rows={8} required aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? 'message-error' : 'message-hint'} />
      </Field>

      <Field label={copy.attachment} htmlFor="attachment" hint={copy.attachmentHint} error={errors.attachment}>
        <div className="contact-file flex flex-wrap items-center gap-3 rounded-[1.1rem] px-4 py-3">
          <input
            ref={fileInput}
            id="attachment"
            name="attachment"
            type="file"
            className="sr-only"
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            aria-invalid={Boolean(errors.attachment)}
            aria-describedby={errors.attachment ? 'attachment-error' : 'attachment-hint'}
            onChange={handleAttachment}
          />
          <Label
            htmlFor="attachment"
            className="contact-file-button inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
          >
            <Paperclip className="size-4" aria-hidden />
            {copy.attachmentChoose}
          </Label>
          <span className={cn('min-w-0 flex-1 truncate text-sm', attachment ? 'text-foreground' : 'text-foreground/45')}>
            {attachment ? attachment.name : copy.attachmentEmpty}
          </span>
          {attachment ? (
            <button
              type="button"
              onClick={clearAttachment}
              className="contact-file-remove inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
            >
              <X className="size-3.5" aria-hidden />
              {copy.attachmentRemove}
            </button>
          ) : null}
        </div>
      </Field>

      {status === 'error' ? (
        <p role="alert" className="text-destructive text-sm">
          {copy.error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={status === 'sending'}
        className="mt-1 w-fit rounded-full bg-primary px-7 text-primary-foreground"
      >
        {status === 'sending' ? copy.sending : copy.submit}
        <ArrowRight className="btn-arrow rtl:-scale-x-100" />
      </Button>
    </form>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={htmlFor} className="flex flex-wrap items-baseline gap-2">
        {label}
        {hint && !error ? <span id={`${htmlFor}-hint`} className="text-muted-foreground text-xs font-normal">{hint}</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Visible channel choices keep a visitor in control of the reply without
 * turning a short project request into paperwork.
 */
function ChannelChoice({
  label,
  options,
}: {
  label: string
  options: Array<{ value: string; label: string }>
}) {
  return (
    <fieldset className="contact-channel-group border-0 p-0">
      <legend className="contact-channel-legend text-sm font-medium leading-none">{label}</legend>
      <div className="contact-channels flex flex-wrap gap-2">
        {options.map((option, index) => (
          <label key={option.value} className="contact-channel cursor-pointer rounded-full px-4 py-2 text-sm font-semibold">
            <input
              type="radio"
              name="preferred"
              value={option.value}
              defaultChecked={index === 0}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function Select({
  id,
  name,
  options,
  className,
}: {
  id: string
  name: string
  options: Array<{ value: string; label: string }>
  className?: string
}) {
  return (
    <select
      id={id}
      name={name}
      defaultValue={options[0]?.value}
      className={cn(
        'border-input bg-background h-9 w-full rounded-lg border px-3 text-sm shadow-xs',
        'focus-visible:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-3',
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
