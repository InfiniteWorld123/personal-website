import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import type { Editor } from '@tiptap/react'
import { AlertTriangle, Check, Loader2, Paperclip, PenLine, Send, Trash2, X } from 'lucide-react'
import * as v from 'valibot'
import {
  EmailAddressSchema,
  INBOX_LANGUAGES,
  INBOX_LIMITS,
  type InboxDraft,
  type InboxLanguage,
  type OutgoingAttachment,
} from '#/backend2/contracts/inbox.contract'
import { type RichTextDoc, richTextToPlainText } from '#/backend2/contracts/rich-text.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { BlogDialog, ConfirmDialog, DialogActions, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { EmailEditor, textToParagraphs } from '#/frontend/features/inbox-v2/EmailEditor'
import { readDraft, saveDraft, sendDraft } from '#/frontend/features/inbox-v2/api'
import { inboxKeys, useDiscardDraft, useInboxSettings, useRefreshInbox, useSnippets } from '#/frontend/features/inbox-v2/queries'
import { MediaPicker } from '#/frontend/features/media/MediaPicker'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { LANGUAGE_WORDS, fileBadge, fileSize, localDraft } from './inbox-parts'

/**
 * Writing one email: a new one, or a reply inside a conversation.
 *
 * The draft saves itself a moment after typing stops and says so — Saving… /
 * Saved / Couldn't save. Saving never sends; only **Send** does, and it is
 * off while a save is running or has failed, so what leaves is exactly what
 * the server holds. A failed save keeps the text on screen (and a local copy
 * in the browser) and offers Retry. A save refused because another tab saved
 * first is shown as a choice rather than resolved silently.
 */

type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'conflict'

type Values = { toEmail: string; subject: string; language: InboxLanguage; bodyDoc: RichTextDoc }

const valuesOf = (draft: InboxDraft): Values => ({
  toEmail: draft.toEmail,
  subject: draft.subject,
  language: draft.language,
  bodyDoc: draft.bodyDoc,
})

/**
 * What the form itself holds. The document lives beside it rather than in it:
 * a recursive tree as a form value sends TanStack Form's field-name types
 * into infinite depth. The form keeps the document's plain text, which is all
 * the validation needs.
 */
type FormValues = { toEmail: string; subject: string; language: InboxLanguage; bodyText: string }

const formOf = (values: Values): FormValues => ({
  toEmail: values.toEmail,
  subject: values.subject,
  language: values.language,
  bodyText: richTextToPlainText(values.bodyDoc),
})

const AUTOSAVE_MS = 900

export function Composer({
  draftId,
  mode,
  counterpart,
  onClose,
  onSent,
  full = false,
}: {
  draftId: string
  mode: 'new' | 'reply'
  counterpart?: { email: string; name: string }
  onClose: () => void
  /** With the conversation the email now lives in. */
  onSent: (conversationId: string) => void
  full?: boolean
}) {
  const draft = useQuery({ queryKey: [...inboxKeys.all, 'draft', draftId], queryFn: () => readDraft(draftId), retry: false, staleTime: Infinity })

  if (draft.isPending) {
    return (
      <div className={cn('flex items-center gap-2 p-4 text-[13px] text-[var(--dash-quiet)]', full && 'flex-1')} role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Opening the draft…
      </div>
    )
  }

  if (draft.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-[13px]">
        <p>This draft could not be opened. {messageFromError(draft.error)}</p>
        <div className="flex gap-2">
          <button type="button" className="dash-btn dash-btn-quiet" onClick={() => void draft.refetch()}>
            Try again
          </button>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <ComposerForm
      key={draft.data.id}
      draft={draft.data}
      mode={mode}
      counterpart={counterpart}
      onClose={onClose}
      onSent={onSent}
      full={full}
    />
  )
}

function ComposerForm({
  draft,
  mode,
  counterpart,
  onClose,
  onSent,
  full,
}: {
  draft: InboxDraft
  mode: 'new' | 'reply'
  counterpart?: { email: string; name: string }
  onClose: () => void
  onSent: (conversationId: string) => void
  full: boolean
}) {
  const refresh = useRefreshInbox()
  const discard = useDiscardDraft()
  const settings = useInboxSettings()
  const snippets = useSnippets(1, 25)

  const revision = useRef(draft.revision)
  const saved = useRef<string>(JSON.stringify(valuesOf(draft)))
  const [attachments, setAttachments] = useState<OutgoingAttachment[]>(draft.attachments)
  const savedAttachments = useRef<string>(JSON.stringify(draft.attachments.map((file) => file.assetId)))
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [conflict, setConflict] = useState<InboxDraft | null>(null)
  const [sendFailure, setSendFailure] = useState<string | null>(null)
  const [askBlankSubject, setAskBlankSubject] = useState(false)
  const [askDiscard, setAskDiscard] = useState(false)
  const [picking, setPicking] = useState(false)
  const [menu, setMenu] = useState<'signature' | 'snippets' | null>(null)
  const editor = useRef<Editor | null>(null)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const draftSnapshot = draft
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  // A local copy newer than the server's wins, so text typed while offline
  // survives a closed tab or a restarted browser.
  const recovered = useRef(
    (() => {
      const local = localDraft.read<Values>(draft.id)

      return local && local.at > Date.parse(draft.updatedAt) ? local : null
    })(),
  )

  const initial: Values = recovered.current
    ? { toEmail: recovered.current.toEmail, subject: recovered.current.subject, language: recovered.current.language, bodyDoc: recovered.current.bodyDoc }
    : valuesOf(draft)
  const [doc, setDoc] = useState<RichTextDoc>(initial.bodyDoc)
  const docRef = useRef<RichTextDoc>(initial.bodyDoc)

  const form = useForm({
    defaultValues: formOf(initial) as FormValues,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}

        if (mode === 'new' && !v.safeParse(EmailAddressSchema, value.toEmail).success) fields.toEmail = 'Enter one valid email address'
        if (value.bodyText.trim() === '') fields.bodyText = 'Write something before sending'

        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmitInvalid: ({ formApi }) => {
      const errors = formApi.state.fieldMeta
      const first = errors.toEmail?.errors?.length ? 'email-to' : 'email-body'

      window.requestAnimationFrame(() => document.getElementById(first)?.focus())
    },
    onSubmit: async ({ value }) => {
      setSendFailure(null)

      if (!(await saveNow())) {
        setSendFailure('The draft could not be saved, so it was not sent. Your text is still here.')

        return
      }

      if (value.subject.trim() === '' && !askBlankSubject) {
        setAskBlankSubject(true)

        return
      }

      await doSend(value.subject.trim() === '')
    },
  })

  const formValues = useStore(form.store, (state) => state.values)
  const values: Values = { toEmail: formValues.toEmail, subject: formValues.subject, language: formValues.language, bodyDoc: doc }

  /** Everything the draft holds right now, read at the moment of saving. */
  const currentValues = (): Values => {
    const state = form.state.values

    return { toEmail: state.toEmail, subject: state.subject, language: state.language, bodyDoc: docRef.current }
  }
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  /* --------------------------------------------------------------- saving */

  const snapshot = useCallback(() => JSON.stringify(currentValues()), [form])

  const saveNow = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current)

    if (inFlight.current) await inFlight.current

    const current = currentValues()
    const text = JSON.stringify(current)
    const ids = attachmentsRef.current.map((file) => file.assetId)
    const idsText = JSON.stringify(ids)

    if (text === saved.current && idsText === savedAttachments.current) return true

    setSaveState('saving')

    const run = (async () => {
      try {
        const next = await saveDraft(draftSnapshot.id, {
          revision: revision.current,
          toEmail: mode === 'new' ? current.toEmail : undefined,
          subject: current.subject,
          bodyDoc: current.bodyDoc,
          language: current.language,
          attachmentAssetIds: idsText === savedAttachments.current ? undefined : ids,
        })

        revision.current = next.revision
        saved.current = text
        savedAttachments.current = idsText
        localDraft.clear(draftSnapshot.id)
        setSavedAt(new Date())
        setSaveState(JSON.stringify(currentValues()) === text ? 'saved' : 'idle')

        return true
      } catch (error) {
        if (error instanceof ApiRequestError && error.code === 'STALE_DRAFT') {
          const newer = (error.details as { draft?: InboxDraft } | undefined)?.draft ?? null

          setConflict(newer)
          setSaveState('conflict')
        } else {
          setSaveState('failed')
        }

        return false
      } finally {
        inFlight.current = null
      }
    })()

    inFlight.current = run

    return run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, mode])

  // Every change schedules a save; the local copy is written at once.
  useEffect(() => {
    const text = JSON.stringify(values)
    const idsText = JSON.stringify(attachments.map((file) => file.assetId))

    if (text === saved.current && idsText === savedAttachments.current) return
    if (saveState === 'conflict') return

    localDraft.write(draft.id, values)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void saveNow(), AUTOSAVE_MS)

    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formValues, doc, attachments, draft.id, saveNow, saveState])

  // Leaving the screen saves what is there.
  useEffect(() => () => void saveNow(), [saveNow])

  /* -------------------------------------------------------------- sending */

  const doSend = async (confirmBlankSubject: boolean) => {
    setAskBlankSubject(false)

    try {
      const result = await sendDraft(draft.id, { revision: revision.current, confirmBlankSubject })

      localDraft.clear(draft.id)
      saved.current = snapshot()
      await refresh()
      notify.success(
        result.message.delivery?.provider === 'fake'
          ? 'Recorded as sent — this is a local test, nothing left the computer'
          : 'Sent · accepted by the email service',
      )
      onSent(result.conversationId)
    } catch (error) {
      if (error instanceof ApiRequestError && error.code === 'SEND_FAILED') {
        const conversationId = (error.details as { conversationId?: string } | undefined)?.conversationId

        localDraft.clear(draft.id)
        await refresh()
        notify.error(`Not sent. ${error.message} It is kept in the conversation with Retry.`)

        if (conversationId) onSent(conversationId)

        return
      }

      if (error instanceof ApiRequestError && error.code === 'STALE_DRAFT') {
        setConflict((error.details as { draft?: InboxDraft } | undefined)?.draft ?? null)
        setSaveState('conflict')

        return
      }

      setSendFailure(messageFromError(error))
    }
  }

  const resolveConflict = (choice: 'theirs' | 'mine') => {
    if (!conflict) return

    revision.current = conflict.revision

    if (choice === 'theirs') {
      form.reset(formOf(valuesOf(conflict)))
      docRef.current = conflict.bodyDoc
      setDoc(conflict.bodyDoc)
      editor.current?.commands.setContent(conflict.bodyDoc)
      setAttachments(conflict.attachments)
      saved.current = JSON.stringify(valuesOf(conflict))
      savedAttachments.current = JSON.stringify(conflict.attachments.map((file) => file.assetId))
      setSaveState('saved')
    } else {
      saved.current = ''
      setSaveState('idle')
      window.setTimeout(() => void saveNow(), 0)
    }

    setConflict(null)
  }

  /* -------------------------------------------------------- inserting text */

  const insertAtEnd = (text: string) => {
    const instance = editor.current

    if (!instance) return

    instance.chain().focus('end').insertContent(textToParagraphs(text)).run()
    setMenu(null)
  }

  const insertHere = (text: string) => {
    editor.current?.chain().focus().insertContent(textToParagraphs(text)).run()
    setMenu(null)
  }

  const addAttachment = (asset: { id: string; displayName: string; contentType: string; byteSize: number }) => {
    setPicking(false)

    if (attachments.some((file) => file.assetId === asset.id)) return

    if (attachments.length >= INBOX_LIMITS.maxAttachments) {
      notify.error(`An email can carry at most ${INBOX_LIMITS.maxAttachments} files`)

      return
    }

    const total = attachments.reduce((sum, file) => sum + file.byteSize, 0) + asset.byteSize

    if (total > INBOX_LIMITS.maxAttachmentBytes) {
      notify.error('Attachments may total at most 25 MB. Send the file as a link instead, or split it.')

      return
    }

    setAttachments((files) => [...files, { assetId: asset.id, fileName: asset.displayName, contentType: asset.contentType, byteSize: asset.byteSize }])
  }

  /* ---------------------------------------------------------------- view */

  const rtl = values.language === 'ar'
  const sendBlocked = saveState === 'saving' || saveState === 'failed' || saveState === 'conflict' || submitting
  const signature = settings.data?.signatures[values.language] ?? ''

  const statusText =
    saveState === 'saving'
      ? 'Saving…'
      : saveState === 'failed'
        ? "Couldn't save. Your text is still here."
        : saveState === 'conflict'
          ? 'Changed in another window'
          : savedAt
            ? `Saved ${savedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
            : recovered.current
              ? 'Restored unsaved text from this browser'
              : 'Draft'

  return (
    <form
      noValidate
      aria-label={mode === 'reply' ? 'Reply' : 'New message'}
      className={cn('flex flex-col gap-2.5 bg-[var(--dash-surface)] p-4', full ? 'min-h-0 flex-1 overflow-y-auto' : 'border-t border-[var(--dash-line)]')}
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">{mode === 'reply' ? `Reply to ${counterpart?.name || counterpart?.email}` : 'New message'}</h2>
        <button type="button" className="dash-btn dash-btn-ghost ms-auto h-8 px-2 text-[12px]" onClick={() => void saveNow().then(onClose)} aria-label="Close and keep the draft">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      {mode === 'new' ? (
        <form.Field name="toEmail">
          {(field) => {
            const error = field.state.meta.errors[0] as string | undefined

            return (
              <div className="grid grid-cols-[64px_1fr] items-center gap-2 border-b border-[var(--dash-line)] pb-1.5">
                <label htmlFor="email-to" className="text-[12px] text-[var(--dash-quiet)]">To</label>
                <input
                  id="email-to"
                  type="email"
                  dir="ltr"
                  autoComplete="off"
                  placeholder="One email address"
                  className="min-w-0 bg-transparent py-1 text-[13.5px] outline-none"
                  value={field.state.value}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'email-to-error' : undefined}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                {error ? <p id="email-to-error" className="col-start-2 text-[12px] text-[var(--dash-red-ink)]">{error}</p> : null}
              </div>
            )
          }}
        </form.Field>
      ) : (
        <p className="grid grid-cols-[64px_1fr] items-center gap-2 border-b border-[var(--dash-line)] pb-1.5 text-[13.5px]">
          <span className="text-[12px] text-[var(--dash-quiet)]">To</span>
          <span dir="ltr" className="truncate">{counterpart?.email ?? draft.toEmail}</span>
        </p>
      )}

      {mode === 'new' || full ? (
        <form.Field name="subject">
          {(field) => (
            <div className="grid grid-cols-[64px_1fr] items-center gap-2 border-b border-[var(--dash-line)] pb-1.5">
              <label htmlFor="email-subject" className="text-[12px] text-[var(--dash-quiet)]">Subject</label>
              <input
                id="email-subject"
                dir="auto"
                maxLength={INBOX_LIMITS.subject}
                className="min-w-0 bg-transparent py-1 text-[13.5px] outline-none"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </div>
          )}
        </form.Field>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <span id="email-body-label" className="sr-only">Message</span>
        <form.Field name="language">
          {(field) => (
            <label className="inline-flex items-center gap-1.5 text-[12px] text-[var(--dash-quiet)]">
              Language
              <select
                className="dash-field h-8 px-2 text-[12px]"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value as InboxLanguage)}
              >
                {INBOX_LANGUAGES.map((language) => (
                  <option key={language} value={language}>{LANGUAGE_WORDS[language]}</option>
                ))}
              </select>
            </label>
          )}
        </form.Field>

        <span className="relative">
          <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" aria-expanded={menu === 'signature'} onClick={() => setMenu(menu === 'signature' ? null : 'signature')}>
            <PenLine className="size-3.5" aria-hidden="true" /> Signature
          </button>
          {menu === 'signature' ? (
            <div className="absolute bottom-full z-20 mb-1 grid w-64 gap-1 rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-surface)] p-1.5 shadow-[var(--dash-shadow)]">
              {signature.trim() ? (
                <button type="button" className="dash-menu-item rounded-md px-2 py-1.5 text-start text-[12.5px] hover:bg-[var(--dash-hover)]" onClick={() => insertAtEnd(signature)}>
                  Insert the {LANGUAGE_WORDS[values.language]} signature
                  <span className="block truncate text-[11.5px] text-[var(--dash-quiet)]">{signature.split('\n')[0]}</span>
                </button>
              ) : (
                <p className="px-2 py-1.5 text-[12px] text-[var(--dash-quiet)]">No {LANGUAGE_WORDS[values.language]} signature yet. Add one under Signatures &amp; replies.</p>
              )}
            </div>
          ) : null}
        </span>

        <span className="relative">
          <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12px]" aria-expanded={menu === 'snippets'} onClick={() => setMenu(menu === 'snippets' ? null : 'snippets')}>
            Ready replies
          </button>
          {menu === 'snippets' ? (
            <div className="absolute bottom-full z-20 mb-1 grid max-h-72 w-72 gap-1 overflow-y-auto rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-surface)] p-1.5 shadow-[var(--dash-shadow)]">
              {(snippets.data?.items ?? []).length === 0 ? (
                <p className="px-2 py-1.5 text-[12px] text-[var(--dash-quiet)]">No ready replies yet. Add them under Signatures &amp; replies.</p>
              ) : (
                snippets.data!.items.map((snippet) => (
                  <button key={snippet.id} type="button" className="rounded-md px-2 py-1.5 text-start text-[12.5px] hover:bg-[var(--dash-hover)]" onClick={() => insertHere(snippet.body)}>
                    {snippet.title}
                    <span className="block text-[11.5px] text-[var(--dash-quiet)]">
                      {snippet.language ? LANGUAGE_WORDS[snippet.language] : 'Any language'} · inserted where you are typing
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </span>
      </div>

      <form.Field name="bodyText">
        {(field) => {
          const error = field.state.meta.errors[0] as string | undefined

          return (
            <div className="flex flex-col gap-1">
              <EmailEditor
                value={initial.bodyDoc}
                onChange={(next) => {
                  docRef.current = next
                  setDoc(next)
                  field.handleChange(richTextToPlainText(next))
                }}
                onReady={(instance) => {
                  editor.current = instance
                }}
                rtl={rtl}
                labelledBy="email-body-label"
                invalid={Boolean(error)}
                describedBy={error ? 'email-body-error' : undefined}
              />
              {error ? <p id="email-body-error" className="text-[12px] text-[var(--dash-red-ink)]">{error}</p> : null}
            </div>
          )
        }}
      </form.Field>

      {attachments.length > 0 ? (
        <ul className="grid gap-1.5" aria-label="Attachments">
          {attachments.map((file) => (
            <li key={file.assetId} className="flex items-center gap-2.5 rounded-[9px] border border-[var(--dash-line)] px-2.5 py-1.5">
              <span className="grid size-8 place-items-center rounded-md bg-[var(--dash-chip)] text-[10px] font-bold text-[var(--dash-quiet)]">{fileBadge(file.contentType, file.fileName)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px]">{file.fileName}</span>
                <span className="text-[11.5px] text-[var(--dash-quiet)]">{fileSize(file.byteSize)} · from Media</span>
              </span>
              <button type="button" className="dash-btn dash-btn-ghost h-7 text-[11.5px]" onClick={() => setAttachments((files) => files.filter((other) => other.assetId !== file.assetId))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {saveState === 'conflict' ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[9px] bg-[var(--dash-red-tint)] px-3 py-2 text-[12.5px] text-[var(--dash-red-ink)]">
          <AlertTriangle className="size-4" aria-hidden="true" />
          This draft was saved from another window. Which version do you want?
          <span className="ms-auto flex gap-1.5">
            <button type="button" className="dash-btn dash-btn-quiet h-7 text-[11.5px]" onClick={() => resolveConflict('theirs')}>Load the other version</button>
            <button type="button" className="dash-btn dash-btn-quiet h-7 text-[11.5px]" onClick={() => resolveConflict('mine')}>Keep mine</button>
          </span>
        </div>
      ) : null}

      {sendFailure ? (
        <p role="alert" className="rounded-[9px] bg-[var(--dash-red-tint)] px-3 py-2 text-[12.5px] text-[var(--dash-red-ink)]">{sendFailure}</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="dash-btn dash-btn-quiet h-9 text-[12.5px]" onClick={() => setPicking(true)}>
          <Paperclip className="size-3.5" aria-hidden="true" /> Add from Media
        </button>
        <span role="status" className={cn('inline-flex items-center gap-1.5 text-[12px]', saveState === 'failed' ? 'font-semibold text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]')}>
          {saveState === 'saving' ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : saveState === 'saved' ? <Check className="size-3.5" aria-hidden="true" /> : null}
          {statusText}
          {saveState === 'failed' ? (
            <button type="button" className="dash-btn dash-btn-quiet h-7 text-[11.5px]" onClick={() => void saveNow()}>Retry</button>
          ) : null}
        </span>
        <span className="ms-auto flex gap-2">
          <button type="button" className="dash-btn dash-btn-ghost h-9 text-[12.5px] text-[var(--dash-red-ink)]" onClick={() => setAskDiscard(true)}>
            <Trash2 className="size-3.5" aria-hidden="true" /> Discard
          </button>
          <button type="submit" className="dash-btn dash-btn-primary h-9" disabled={sendBlocked} aria-describedby={sendBlocked && !submitting ? 'send-why' : undefined}>
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {submitting ? 'Sending…' : 'Send'}
          </button>
          {sendBlocked && !submitting ? <span id="send-why" className="sr-only">Send is available once the draft is saved.</span> : null}
        </span>
      </div>

      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onChoose={addAttachment}
        title="Attach a file from Media"
        description="Upload from your computer here if it is not in Media yet — it goes into Media first, then into this email."
      />

      {askBlankSubject ? (
        <BlogDialog labelledBy="blank-title" describedBy="blank-text" role="alertdialog" size="sm" onClose={() => setAskBlankSubject(false)}>
          <DialogTitle id="blank-title">Send without a subject?</DialogTitle>
          <p id="blank-text" className="text-[13px] text-[var(--dash-quiet)]">Many people skip emails with no subject. You can add one, or send it as it is.</p>
          <DialogActions>
            <button type="button" className="dash-btn dash-btn-ghost" data-autofocus onClick={() => { setAskBlankSubject(false); window.requestAnimationFrame(() => document.getElementById('email-subject')?.focus()) }}>
              Add a subject
            </button>
            <button type="button" className="dash-btn dash-btn-primary" onClick={() => void doSend(true)}>Send anyway</button>
          </DialogActions>
        </BlogDialog>
      ) : null}

      {askDiscard ? (
        <ConfirmDialog
          title="Discard this draft?"
          confirmLabel="Discard draft"
          danger
          onClose={() => setAskDiscard(false)}
          onConfirm={async () => {
            window.clearTimeout(timer.current)
            saved.current = snapshot()
            await discard.mutateAsync(draft.id)
            localDraft.clear(draft.id)
            notify.success('Draft discarded')
            onClose()
          }}
        >
          <p>The text and the list of attachments are deleted. Files stay in Media.</p>
        </ConfirmDialog>
      ) : null}
    </form>
  )
}
