import { useEffect, useRef, useState } from 'react'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { ArrowRight, Paperclip, X } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Textarea } from '#/frontend/components/ui/textarea'
import type { ContactCopy } from '#/frontend/content/types'
import { newSubmissionId } from '#/frontend/features/booking/v2/format'
import { TurnstileWidget } from '#/frontend/features/security/TurnstileWidget'
import type { Language } from '#/frontend/i18n/language'
import { cn } from '#/frontend/lib/utils'
import { CallInstead, Field } from './contact-parts'
import {
  CONTACT_V2_ACCEPT,
  CONTACT_V2_ENDPOINT,
  CONTACT_V2_LIMITS,
  EMAIL_PATTERN,
  PHONE_PATTERN,
  fileProblem,
  getContactV2Words,
} from './contact-v2'

/**
 * The Contact form, posting to Backend2 (`docs/v2/public-cutover.md`, step 6).
 *
 * The accepted design, minus the two selects — "What is it about?" and
 * "Budget range" are gone from Contact by the owner's decision (Booking keeps
 * them). One optional file of up to 10 MB: a PDF, an image, a video, or a
 * Word, Excel or PowerPoint file. Each fill carries one `submissionId`, so a
 * double press or a retry after a lost answer becomes one conversation in the
 * Inbox, never two.
 */

type TextField = 'name' | 'email' | 'company' | 'phone' | 'message'
type FieldName = TextField | 'attachment'

const TEXT_FIELDS: readonly TextField[] = ['name', 'email', 'company', 'phone', 'message']
const SERVER_FIELDS: readonly FieldName[] = [...TEXT_FIELDS, 'attachment']

type Envelope = { success?: boolean; code?: string; details?: { issues?: Array<{ field?: string }> } }

export function ContactFormV2({ copy, language }: { copy: ContactCopy['form']; language: Language }) {
  const words = getContactV2Words(language)
  const [sent, setSent] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const [turnstileResetKey, setTurnstileResetKey] = useState(0)
  const submissionId = useRef(newSubmissionId())
  const fileInput = useRef<HTMLInputElement>(null)
  const honeypot = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const inFlight = useRef(false)
  // Its own flag, not the form's: a second press ends its own submit at once
  // and would clear the form's `isSubmitting` while the first is still out.
  const [sending, setSending] = useState(false)

  const fileMessage = (file: File | null): string | undefined => {
    const problem = file ? fileProblem(file) : null

    return problem === 'size' ? words.fileSize : problem === 'type' ? words.fileType : undefined
  }

  const focusFirstInvalid = () =>
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())

  const form = useForm({
    defaultValues: { name: '', email: '', company: '', phone: '', message: '', attachment: null as File | null },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Partial<Record<FieldName, string>> = {}
        const message = value.message.trim()
        const phone = value.phone.trim()

        if (value.name.trim() === '') fields.name = copy.errors.name
        else if (value.name.trim().length > CONTACT_V2_LIMITS.name) fields.name = words.tooLong

        if (!EMAIL_PATTERN.test(value.email.trim()) || value.email.trim().length > CONTACT_V2_LIMITS.email) {
          fields.email = copy.errors.email
        }

        if (phone !== '' && (!PHONE_PATTERN.test(phone) || phone.length > CONTACT_V2_LIMITS.phone)) fields.phone = words.phone
        if (value.company.trim().length > CONTACT_V2_LIMITS.company) fields.company = words.tooLong

        if (message.length < CONTACT_V2_LIMITS.messageMin) fields.message = message === '' ? copy.errors.message : words.messageShort
        else if (message.length > CONTACT_V2_LIMITS.message) fields.message = words.messageLong

        const file = fileMessage(value.attachment)

        if (file) fields.attachment = file

        return Object.keys(fields).length > 0 ? { fields } : undefined
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      if (inFlight.current || !turnstileToken) return

      inFlight.current = true
      setSending(true)
      setFailure(null)
      setServerErrors({})

      const body = new FormData()

      body.set('submissionId', submissionId.current)
      body.set('name', value.name.trim())
      body.set('email', value.email.trim())
      body.set('company', value.company.trim())
      body.set('phone', value.phone.trim())
      body.set('message', value.message.trim())
      // The page the visitor wrote on decides the language the reply is written in.
      body.set('language', language)
      body.set('turnstileToken', turnstileToken)
      body.set('website', honeypot.current?.value ?? '')
      if (value.attachment) body.set('attachment', value.attachment, value.attachment.name)

      try {
        const response = await fetch(CONTACT_V2_ENDPOINT, { method: 'POST', body, headers: { accept: 'application/json' } })
        const envelope = (await response.json().catch(() => null)) as Envelope | null

        if (response.ok && envelope?.success) {
          setSent(true)
          form.reset()
          // A new message after this one is a new submission.
          submissionId.current = newSubmissionId()

          return
        }

        const code = envelope?.code

        if (code === 'FILE_TOO_LARGE' || code === 'BODY_TOO_LARGE') return showServer({ attachment: words.fileSize })
        if (code === 'UNSUPPORTED_FILE_TYPE') return showServer({ attachment: words.fileType })

        if (code === 'VALIDATION_ERROR') {
          const found: Partial<Record<FieldName, string>> = {}

          for (const issue of envelope?.details?.issues ?? []) {
            const field = SERVER_FIELDS.find((name) => name === issue.field)

            if (field) found[field] = serverMessage(field)
          }

          if (Object.keys(found).length > 0) return showServer(found)
        }

        setFailure(code === 'RATE_LIMITED' ? words.rateLimited : code === 'VERIFICATION_FAILED' ? words.verification : copy.error)
      } catch {
        setFailure(copy.error)
      } finally {
        inFlight.current = false
        setSending(false)
        // A Turnstile token is good for one check only.
        setTurnstileToken(null)
        setTurnstileResetKey((key) => key + 1)
      }
    },
  })

  const serverMessage = (field: FieldName): string =>
    field === 'name'
      ? copy.errors.name
      : field === 'email'
        ? copy.errors.email
        : field === 'message'
          ? copy.errors.message
          : field === 'phone'
            ? words.phone
            : field === 'attachment'
              ? words.fileType
              : words.tooLong

  const showServer = (found: Partial<Record<FieldName, string>>) => {
    setServerErrors(found)
    focusFirstInvalid()
  }

  const clearServer = (name: FieldName) =>
    setServerErrors((previous) => (previous[name] ? { ...previous, [name]: undefined } : previous))

  const submitting = useStore(form.store, (state) => state.isSubmitting) || sending

  /*
   * The page is rendered on the server, so a visitor can start typing before
   * the script arrives. The fields are uncontrolled for that reason — React
   * leaves what is in them alone when it takes over — and whatever is already
   * there is read into the form once it has.
   */
  useEffect(() => {
    const elements = formRef.current?.elements

    if (!elements) return

    for (const name of TEXT_FIELDS) {
      const element = elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null

      if (element && element.value !== '') form.setFieldValue(name, element.value)
    }

    const file = fileInput.current?.files?.[0]

    if (file) form.setFieldValue('attachment', file)
  }, [form])

  if (sent) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-2xl border border-primary/15 bg-primary/5 p-8">
        <p className="section-title text-display-sm text-foreground">{copy.sent.title}</p>
        <p className="m-0 text-base leading-8 text-foreground/62">{copy.sent.body}</p>
      </div>
    )
  }

  const errorOf = (name: FieldName, errors: unknown[]) => (typeof errors[0] === 'string' ? errors[0] : undefined) ?? serverErrors[name]

  const text = (
    name: TextField,
    label: string,
    input: { type?: string; autoComplete?: string; inputMode?: 'tel'; dir?: 'ltr'; hint?: string },
  ) => (
    <form.Field name={name}>
      {(field) => {
        const error = errorOf(name, field.state.meta.errors)

        return (
          <Field label={label} htmlFor={name} hint={input.hint} error={error}>
            <Input
              id={name}
              name={name}
              type={input.type ?? 'text'}
              autoComplete={input.autoComplete}
              inputMode={input.inputMode}
              dir={input.dir}
              defaultValue={field.state.value}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${name}-error` : input.hint ? `${name}-hint` : undefined}
              onBlur={field.handleBlur}
              onChange={(event) => {
                clearServer(name)
                field.handleChange(event.target.value)
              }}
            />
          </Field>
        )
      }}
    </form.Field>
  )

  return (
    <form
      ref={formRef}
      noValidate
      className="contact-form flex flex-col gap-7"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {text('name', copy.name, { autoComplete: 'name' })}
        {text('email', copy.email, { type: 'email', autoComplete: 'email', dir: 'ltr' })}
      </div>

      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        {text('company', copy.company, { autoComplete: 'organization', hint: copy.companyOptional })}
        {text('phone', copy.phone, { type: 'tel', autoComplete: 'tel', inputMode: 'tel', dir: 'ltr', hint: copy.phoneOptional })}
      </div>

      <CallInstead language={language} />

      <form.Field name="message">
        {(field) => {
          const error = errorOf('message', field.state.meta.errors)

          return (
            <Field label={copy.message} htmlFor="message" hint={copy.messageHint} error={error} className="message-field">
              <Textarea
                id="message"
                name="message"
                className="contact-message"
                rows={8}
                defaultValue={field.state.value}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'message-error' : 'message-hint'}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  clearServer('message')
                  field.handleChange(event.target.value)
                }}
              />
            </Field>
          )
        }}
      </form.Field>

      <form.Field
        name="attachment"
        // Choosing a file is the visitor acting on this field, so a file that
        // cannot be sent is said at once rather than after the next press.
        validators={{ onChange: ({ value }) => fileMessage(value) }}
      >
        {(field) => {
          const error = errorOf('attachment', field.state.meta.errors)
          const file = field.state.value

          return (
            <Field label={copy.attachment} htmlFor="attachment" hint={words.attachmentHint} error={error}>
              <div className="contact-file flex flex-wrap items-center gap-3 rounded-[1.1rem] px-4 py-3">
                <input
                  ref={fileInput}
                  id="attachment"
                  name="attachment"
                  type="file"
                  className="sr-only"
                  accept={CONTACT_V2_ACCEPT}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'attachment-error' : 'attachment-hint'}
                  onChange={(event) => {
                    clearServer('attachment')
                    field.handleChange(event.currentTarget.files?.[0] ?? null)
                  }}
                />
                <Label
                  htmlFor="attachment"
                  className="contact-file-button inline-flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
                >
                  <Paperclip className="size-4" aria-hidden />
                  {copy.attachmentChoose}
                </Label>
                <span className={cn('min-w-0 flex-1 truncate text-sm', file ? 'text-foreground' : 'text-foreground/45')}>
                  {file ? file.name : copy.attachmentEmpty}
                </span>
                {file ? (
                  <button
                    type="button"
                    onClick={() => {
                      clearServer('attachment')
                      field.handleChange(null)
                      if (fileInput.current) fileInput.current.value = ''
                    }}
                    className="contact-file-remove inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                  >
                    <X className="size-3.5" aria-hidden />
                    {copy.attachmentRemove}
                  </button>
                ) : null}
              </div>
            </Field>
          )
        }}
      </form.Field>

      {/* Hidden by clipping, never by pushing it off the side: a large
          negative inset widens the document by that distance, and in RTL the
          page then opens scrolled onto the empty strip and reads as blank. */}
      <div aria-hidden="true" className="sr-only">
        <label htmlFor="contact-website">Website</label>
        <input ref={honeypot} id="contact-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <TurnstileWidget action="contact_submit" language={language} resetKey={turnstileResetKey} onTokenChange={setTurnstileToken} />

      {failure ? (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={submitting || !turnstileToken}
        aria-busy={submitting}
        className="mt-1 w-fit rounded-full bg-primary px-7 text-primary-foreground"
      >
        {submitting ? copy.sending : copy.submit}
        <ArrowRight className="btn-arrow rtl:-scale-x-100" />
      </Button>
    </form>
  )
}
