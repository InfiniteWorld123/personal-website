import { revalidateLogic, useForm } from '@tanstack/react-form'
import { isSafeHref } from '#/backend2/contracts/rich-text.contract'
import { BlogDialog, DialogActions, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'

/** Email links are absolute. Bare domains get the familiar HTTPS default. */
export const emailLinkHref = (value: string): string | null => {
  const entered = value.trim()
  if (!entered || entered.length > 2000 || /\s|\\/u.test(entered) || entered.startsWith('/')) return null
  const href = /^[a-z][a-z\d+.-]*:/iu.test(entered) ? entered : `https://${entered}`
  if (!isSafeHref(href) || href.length > 2000) return null
  const url = new URL(href)
  if (url.username || url.password || (url.protocol === 'mailto:' && !url.pathname)) return null

  return href
}

export function EmailLinkDialog({
  text, href, onApply, onClose,
}: {
  text: string
  href: string
  onApply: (value: { text: string; href: string }) => void
  onClose: () => void
}) {
  const form = useForm({
    defaultValues: { text, href },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => emailLinkHref(value.href)
        ? undefined
        : { fields: { href: 'Enter a website address or a mailto: email link.' } },
    },
    onSubmitInvalid: () => document.getElementById('email-link-address')?.focus(),
    onSubmit: ({ value }) => {
      const address = emailLinkHref(value.href)
      if (address) onApply({ text: value.text.trim() || address, href: address })
    },
  })

  return (
    <BlogDialog labelledBy="email-link-title" size="sm" onClose={onClose}>
      <DialogTitle id="email-link-title">{href ? 'Edit link' : 'Insert link'}</DialogTitle>
      <form noValidate className="flex flex-col gap-3" onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}>
        <form.Field name="text">
          {(field) => (
            <label className="flex flex-col gap-1 text-[12.5px]" htmlFor="email-link-text">
              Text to display
              <input id="email-link-text" className="dash-field" value={field.state.value} placeholder="Leave blank to show the address" onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
            </label>
          )}
        </form.Field>
        <form.Field name="href">
          {(field) => {
            const error = field.state.meta.errors[0] as string | undefined
            return (
              <div className="flex flex-col gap-1 text-[12.5px]">
                <label htmlFor="email-link-address">Link address</label>
                <input id="email-link-address" data-autofocus className="dash-field" dir="ltr" value={field.state.value} placeholder="https://example.com" aria-invalid={Boolean(error)} aria-describedby={error ? 'email-link-error' : undefined} onChange={(event) => field.handleChange(event.target.value)} onBlur={field.handleBlur} />
                {error ? <p id="email-link-error" className="text-[var(--dash-red-ink)]">{error}</p> : null}
              </div>
            )
          }}
        </form.Field>
        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>Cancel</button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(busy) => <button type="submit" disabled={busy} className="dash-btn dash-btn-primary">{href ? 'Save link' : 'Insert link'}</button>}
          </form.Subscribe>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}
