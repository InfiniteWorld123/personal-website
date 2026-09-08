import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Textarea } from '#/frontend/components/ui/textarea'
import type { ContactCopy } from '#/frontend/content/types'
import { site } from '#/frontend/content/site'
import { cn } from '#/frontend/lib/utils'

type Status = 'idle' | 'sending' | 'sent' | 'error'
type FieldErrors = Partial<Record<'name' | 'email' | 'message', string>>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Qualifying contact form (decision D13): project type, budget band, and
 * timeline are asked up front so every conversation starts with context.
 * Posts to the legacy contact endpoint until the leads module lands in B4.
 */
export function ContactForm({ copy }: { copy: ContactCopy['form'] }) {
  const [status, setStatus] = useState<Status>('idle')
  const [errors, setErrors] = useState<FieldErrors>({})

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

    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setStatus('sending')

    try {
      const response = await fetch(site.contactEndpoint, { method: 'POST', body: data })

      if (!response.ok) throw new Error(`Contact endpoint returned ${response.status}`)

      setStatus('sent')
      form.reset()
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
    <form onSubmit={handleSubmit} noValidate className="contact-form flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label={copy.name} htmlFor="name" error={errors.name}>
          <Input id="name" name="name" autoComplete="name" required aria-invalid={Boolean(errors.name)} />
        </Field>
        <Field label={copy.email} htmlFor="email" error={errors.email}>
          <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={Boolean(errors.email)} dir="ltr" />
        </Field>
      </div>

      <Field label={copy.company} htmlFor="company" hint={copy.companyOptional}>
        <Input id="company" name="company" autoComplete="organization" />
      </Field>

      <div className="grid gap-6 sm:grid-cols-3">
        <Field label={copy.projectType} htmlFor="projectType">
          <Select id="projectType" name="projectType" options={copy.projectTypes} />
        </Field>
        <Field label={copy.budget} htmlFor="budget">
          <Select id="budget" name="budget" options={copy.budgets} />
        </Field>
        <Field label={copy.timeline} htmlFor="timeline">
          <Select id="timeline" name="timeline" options={copy.timelines} />
        </Field>
      </div>

      <Field label={copy.message} htmlFor="message" hint={copy.messageHint} error={errors.message} className="message-field">
        <Textarea id="message" name="message" className="contact-message" rows={8} required aria-invalid={Boolean(errors.message)} aria-describedby={errors.message ? 'message-error' : 'message-hint'} />
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
        className="w-fit rounded-full bg-primary px-7 text-primary-foreground"
      >
        {status === 'sending' ? copy.sending : copy.submit}
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
