import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addNote,
  compose,
  deleteAttachment,
  deleteNote,
  fetchInbox,
  fetchPerson,
  fetchSettings,
  reply,
  saveSignature,
  saveSnippets,
  setArchived,
  setMessageRead,
  setRead,
  setStarred,
  updateNote,
  updatePerson,
} from '#/frontend/api/inbox.api'
import type {
  ComposeInput,
  InboxLens,
  NoteInput,
  PersonWriteInput,
  ReplyInput,
  SignatureInput,
  SnippetsInput,
} from '#/shared/validation/inbox.validation'

/**
 * One key prefix for the whole section, so any write refreshes every list that
 * might now be wrong with a single invalidation. Answering somebody changes
 * their row in the list, their thread, and the unread count — three things
 * from one click.
 */
const INBOX = ['admin', 'inbox'] as const

export const inboxQuery = (lens: InboxLens, search: string) =>
  queryOptions({
    queryKey: [...INBOX, 'list', lens, search],
    queryFn: () => fetchInbox(lens, search),
  })

export const personQuery = (personId: string) =>
  queryOptions({
    queryKey: [...INBOX, 'person', personId],
    queryFn: () => fetchPerson(personId),
    enabled: personId !== '',
  })

export const settingsQuery = () =>
  queryOptions({
    queryKey: [...INBOX, 'settings'],
    queryFn: fetchSettings,
    // Changes only when he edits them, which is rare and never while a
    // conversation is open.
    staleTime: 5 * 60_000,
  })

/**
 * Every mutation refreshes the whole section rather than patching a cache by
 * hand.
 *
 * Deliberate: the alternative is a dozen small cache updates that each have to
 * stay correct as the screens change, and a stale list after a reply is
 * exactly the quiet wrongness that makes a panel feel broken. The lists are
 * small and the refetch is one request.
 *
 * Failures surface on their own — `router.tsx` gives the QueryClient a default
 * `onError` for every mutation.
 */
const useInboxMutation = <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) => {
  const client = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => void client.invalidateQueries({ queryKey: INBOX }),
  })
}

export const useUpdatePerson = (personId: string) =>
  useInboxMutation((input: PersonWriteInput) => updatePerson(personId, input))

export const useSetStarred = (personId: string) =>
  useInboxMutation((starred: boolean) => setStarred(personId, starred))

export const useSetArchived = (personId: string) =>
  useInboxMutation((archived: boolean) => setArchived(personId, archived))

export const useSetRead = (personId: string) =>
  useInboxMutation((read: boolean) => setRead(personId, read))

export const useAddNote = (personId: string) =>
  useInboxMutation((input: NoteInput) => addNote(personId, input))

export const useUpdateNote = (personId: string) =>
  useInboxMutation((input: { noteId: string } & NoteInput) =>
    updateNote(personId, input.noteId, { body: input.body }),
  )

export const useDeleteNote = (personId: string) =>
  useInboxMutation((noteId: string) => deleteNote(personId, noteId))

export const useReply = (personId: string) =>
  useInboxMutation((input: ReplyInput) => reply(personId, input))

/**
 * A new letter with its files, as one request.
 *
 * The files travel *with* the letter rather than after it. They used to be
 * uploaded once the letter had already gone out, with the error swallowed — so
 * a document never arrived and nothing on the screen said so. Now nothing is
 * sent unless every file can be stored.
 */
export const useCompose = () =>
  useInboxMutation((input: ComposeInput & { files: File[] }) => {
    const { files, ...message } = input

    return compose(message, files)
  })

export const useSetMessageRead = (personId: string) =>
  useInboxMutation((input: { messageId: string; read: boolean }) =>
    setMessageRead(personId, input.messageId, input.read),
  )

export const useDeleteAttachment = (personId: string) =>
  useInboxMutation((attachmentId: string) => deleteAttachment(personId, attachmentId))

export const useSaveSignature = () =>
  useInboxMutation((input: SignatureInput) => saveSignature(input))

export const useSaveSnippets = () => useInboxMutation((input: SnippetsInput) => saveSnippets(input))
