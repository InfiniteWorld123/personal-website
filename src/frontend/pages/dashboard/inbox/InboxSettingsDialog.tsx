import { useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react'
import {
  INBOX_LANGUAGES,
  INBOX_LIMITS,
  type InboxLanguage,
  type InboxSnippet,
} from '#/backend2/contracts/inbox.contract'
import { BlogDialog, ConfirmDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import {
  useCreateSnippet,
  useDeleteSnippet,
  useInboxSettings,
  useSaveSettings,
  useSnippets,
  useUpdateSnippet,
} from '#/frontend/features/inbox-v2/queries'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { Pager } from '../blog/blog-parts'
import { LANGUAGE_WORDS } from './inbox-parts'

/**
 * Signatures and ready replies, inside the Inbox (approved choice 5A). A
 * signature is one per language; inserting it is visible and editable in the
 * draft. Nothing here is ever sent on its own.
 */

function Signatures({ initial }: { initial: Record<InboxLanguage, string> }) {
  const save = useSaveSettings()
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}

        for (const language of INBOX_LANGUAGES) {
          if (value[language].length > INBOX_LIMITS.signature) fields[language] = `Keep it under ${INBOX_LIMITS.signature} characters`
        }

        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmit: async ({ value }) => {
      setFailure(null)

      try {
        await save.mutateAsync(value)
        notify.success('Signatures saved')
      } catch (error) {
        setFailure(messageFromError(error))
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <h3 className="text-[13px] font-semibold">Signatures</h3>
      {INBOX_LANGUAGES.map((language) => (
        <form.Field key={language} name={language}>
          {(field) => {
            const error = field.state.meta.errors[0] as string | undefined

            return (
              <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
                {LANGUAGE_WORDS[language]}
                <textarea
                  rows={3}
                  dir={language === 'ar' ? 'rtl' : 'ltr'}
                  className="dash-field px-2.5 py-2 text-[13px] text-[var(--dash-ink)]"
                  value={field.state.value}
                  aria-invalid={Boolean(error)}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {error ? <span className="text-[var(--dash-red-ink)]">{error}</span> : null}
              </label>
            )
          }}
        </form.Field>
      ))}
      {failure ? <DialogAlert>{failure}</DialogAlert> : null}
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <button type="submit" className="dash-btn dash-btn-primary self-start" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Save signatures
          </button>
        )}
      </form.Subscribe>
    </form>
  )
}

function SnippetForm({ snippet, onDone }: { snippet: InboxSnippet | null; onDone: () => void }) {
  const create = useCreateSnippet()
  const update = useUpdateSnippet()
  const [failure, setFailure] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { title: snippet?.title ?? '', language: (snippet?.language ?? '') as InboxLanguage | '', body: snippet?.body ?? '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}

        if (value.title.trim() === '') fields.title = 'Give the ready reply a title'
        if (value.title.length > INBOX_LIMITS.snippetTitle) fields.title = `Keep the title under ${INBOX_LIMITS.snippetTitle} characters`
        if (value.body.trim() === '') fields.body = 'Write the ready reply'
        if (value.body.length > INBOX_LIMITS.snippetBody) fields.body = `Keep it under ${INBOX_LIMITS.snippetBody} characters`

        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmitInvalid: () => window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-snippet-form] [aria-invalid="true"]')?.focus()),
    onSubmit: async ({ value }) => {
      setFailure(null)

      const input = { title: value.title.trim(), language: value.language || null, body: value.body.trim() }

      try {
        if (snippet) await update.mutateAsync({ id: snippet.id, ...input })
        else await create.mutateAsync(input)

        notify.success('Ready reply saved')
        onDone()
      } catch (error) {
        setFailure(messageFromError(error))
      }
    },
  })

  return (
    <form
      noValidate
      data-snippet-form
      className="flex flex-col gap-2 rounded-[10px] border border-[var(--dash-line)] p-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="title">
        {(field) => (
          <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
            Title
            <input className="dash-field h-9 px-2.5 text-[13px] text-[var(--dash-ink)]" value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} onChange={(event) => field.handleChange(event.target.value)} />
            {field.state.meta.errors[0] ? <span className="text-[var(--dash-red-ink)]">{field.state.meta.errors[0] as string}</span> : null}
          </label>
        )}
      </form.Field>
      <form.Field name="language">
        {(field) => (
          <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
            Language
            <select className="dash-field h-9 px-2 text-[13px] text-[var(--dash-ink)]" value={field.state.value} onChange={(event) => field.handleChange(event.target.value as InboxLanguage | '')}>
              <option value="">Any language</option>
              {INBOX_LANGUAGES.map((language) => (
                <option key={language} value={language}>{LANGUAGE_WORDS[language]}</option>
              ))}
            </select>
          </label>
        )}
      </form.Field>
      <form.Field name="body">
        {(field) => (
          <label className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
            Text
            <textarea rows={4} dir="auto" className="dash-field px-2.5 py-2 text-[13px] text-[var(--dash-ink)]" value={field.state.value} aria-invalid={field.state.meta.errors.length > 0} onChange={(event) => field.handleChange(event.target.value)} />
            {field.state.meta.errors[0] ? <span className="text-[var(--dash-red-ink)]">{field.state.meta.errors[0] as string}</span> : null}
          </label>
        )}
      </form.Field>
      {failure ? <DialogAlert>{failure}</DialogAlert> : null}
      <div className="flex gap-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(submitting) => (
            <button type="submit" className="dash-btn dash-btn-primary h-8 text-[12px]" disabled={submitting}>
              {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Save ready reply
            </button>
          )}
        </form.Subscribe>
        <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

export function InboxSettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useInboxSettings()
  const [page, setPage] = useState(1)
  const snippets = useSnippets(page, 10)
  const remove = useDeleteSnippet()
  const [editing, setEditing] = useState<InboxSnippet | 'new' | null>(null)
  const [deleting, setDeleting] = useState<InboxSnippet | null>(null)

  return (
    <BlogDialog labelledBy="inbox-settings-title" size="lg" onClose={onClose}>
      <DialogTitle id="inbox-settings-title">Signatures &amp; ready replies</DialogTitle>
      <p className="text-[12.5px] text-[var(--dash-quiet)]">
        Email goes out from <b dir="ltr">{settings.data?.fromAddress ?? 'info@yamanwarda.de'}</b>.
        {settings.data?.sendMode === 'fake' ? ' Sending is in local test mode here: nothing leaves this computer.' : ''}
      </p>

      <div className="grid max-h-[65vh] gap-5 overflow-y-auto pe-1 md:grid-cols-2">
        {settings.isPending ? (
          <p className="text-[12.5px] text-[var(--dash-quiet)]">Loading…</p>
        ) : settings.isError ? (
          <DialogAlert>{messageFromError(settings.error)}</DialogAlert>
        ) : (
          <Signatures initial={settings.data.signatures} />
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold">Ready replies</h3>
            <button type="button" className="dash-btn dash-btn-quiet ms-auto h-8 text-[12px]" onClick={() => setEditing('new')}>
              <Plus className="size-3.5" aria-hidden="true" /> New
            </button>
          </div>
          {editing === 'new' ? <SnippetForm snippet={null} onDone={() => setEditing(null)} /> : null}
          {snippets.isError ? <DialogAlert>{messageFromError(snippets.error)}</DialogAlert> : null}
          {snippets.data?.items.length === 0 && editing !== 'new' ? (
            <p className="text-[12.5px] text-[var(--dash-quiet)]">No ready replies yet. A ready reply is text you insert into a draft and can still edit before sending.</p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {snippets.data?.items.map((snippet) =>
              editing !== 'new' && editing?.id === snippet.id ? (
                <li key={snippet.id}><SnippetForm snippet={snippet} onDone={() => setEditing(null)} /></li>
              ) : (
                <li key={snippet.id} className="flex items-start gap-2 rounded-[10px] border border-[var(--dash-line)] px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{snippet.title}</span>
                    <span className="block text-[11.5px] text-[var(--dash-quiet)]">{snippet.language ? LANGUAGE_WORDS[snippet.language] : 'Any language'}</span>
                    <span className="mt-1 line-clamp-2 block text-[12px] text-[var(--dash-quiet)]" dir="auto">{snippet.body}</span>
                  </span>
                  <button type="button" className="dash-btn dash-btn-ghost h-7 px-2" aria-label={`Edit ${snippet.title}`} onClick={() => setEditing(snippet)}>
                    <Pencil className="size-3.5" aria-hidden="true" />
                  </button>
                  <button type="button" className="dash-btn dash-btn-ghost h-7 px-2 text-[var(--dash-red-ink)]" aria-label={`Delete ${snippet.title}`} onClick={() => setDeleting(snippet)}>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </li>
              ),
            )}
          </ul>
          {snippets.data ? <Pager page={snippets.data.page} pageCount={snippets.data.pageCount} onPage={setPage} /> : null}
        </div>
      </div>

      <DialogActions>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>Close</button>
      </DialogActions>

      {deleting ? (
        <ConfirmDialog
          title={`Delete “${deleting.title}”?`}
          confirmLabel="Delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove.mutateAsync(deleting.id)
            setDeleting(null)
            notify.success('Ready reply deleted')
          }}
        >
          <p>Drafts that already contain its text keep it.</p>
        </ConfirmDialog>
      ) : null}
    </BlogDialog>
  )
}
