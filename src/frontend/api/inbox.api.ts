import type { InboxRow, InboxSettings, Person } from '#/shared/types/inbox.types'
import type {
  ComposeInput,
  InboxLens,
  NoteInput,
  PersonWriteInput,
  ReplyInput,
  SignatureInput,
  SnippetsInput,
} from '#/shared/validation/inbox.validation'
import { api } from './client'
import { unwrap } from './response'

/**
 * Eden Treaty revives anything that parses as an ISO date into a `Date`, so
 * every instant arrives as an object even though the type says `string` — the
 * trap `booking.api.ts` and `post.api.ts` both document. Rendering one throws
 * "Objects are not valid as a React child".
 */
const toInstant = <T extends string | null>(value: T): T =>
  ((value as unknown) instanceof Date ? (value as unknown as Date).toISOString() : value) as T

const normaliseRow = (row: InboxRow): InboxRow => ({
  ...row,
  lastMessageAt: toInstant(row.lastMessageAt),
})

const normalisePerson = (person: Person): Person => ({
  ...person,
  createdAt: toInstant(person.createdAt),
  messages: person.messages.map((message) => ({
    ...message,
    sentAt: toInstant(message.sentAt),
    readAt: toInstant(message.readAt),
  })),
  notes: person.notes.map((note) => ({
    ...note,
    createdAt: toInstant(note.createdAt),
    updatedAt: toInstant(note.updatedAt),
  })),
})

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function fetchInbox(lens: InboxLens, search: string): Promise<InboxRow[]> {
  const rows = unwrap<InboxRow[]>(
    await api().admin.inbox.get({ query: { lens, search, limit: '200' } }),
  )

  return rows.map(normaliseRow)
}

export async function fetchPerson(personId: string): Promise<Person> {
  return normalisePerson(unwrap<Person>(await api().admin.inbox({ personId }).get()))
}

export async function fetchSettings(): Promise<InboxSettings> {
  return unwrap<InboxSettings>(await api().admin.inbox.settings.get())
}

/* -------------------------------------------------------------------------- */
/* The person                                                                 */
/* -------------------------------------------------------------------------- */

export async function updatePerson(personId: string, input: PersonWriteInput): Promise<Person> {
  return normalisePerson(unwrap<Person>(await api().admin.inbox({ personId }).put(input)))
}

export async function setStarred(personId: string, starred: boolean): Promise<Person> {
  const route = api().admin.inbox({ personId })

  return normalisePerson(unwrap<Person>(await (starred ? route.star.post() : route.unstar.post())))
}

export async function setArchived(personId: string, archived: boolean): Promise<Person> {
  const route = api().admin.inbox({ personId })

  return normalisePerson(
    unwrap<Person>(await (archived ? route.archive.post() : route.unarchive.post())),
  )
}

export async function setRead(personId: string, read: boolean): Promise<Person> {
  const route = api().admin.inbox({ personId })

  return normalisePerson(unwrap<Person>(await (read ? route.read.post() : route.unread.post())))
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

export async function addNote(personId: string, input: NoteInput): Promise<Person> {
  return normalisePerson(unwrap<Person>(await api().admin.inbox({ personId }).notes.post(input)))
}

export async function updateNote(
  personId: string,
  noteId: string,
  input: NoteInput,
): Promise<Person> {
  return normalisePerson(
    unwrap<Person>(await api().admin.inbox({ personId }).notes({ noteId }).put(input)),
  )
}

export async function deleteNote(personId: string, noteId: string): Promise<Person> {
  return normalisePerson(
    unwrap<Person>(await api().admin.inbox({ personId }).notes({ noteId }).delete()),
  )
}

/* -------------------------------------------------------------------------- */
/* Letters                                                                    */
/* -------------------------------------------------------------------------- */

export async function reply(
  personId: string,
  input: ReplyInput,
): Promise<{ messageId: string; sent: boolean }> {
  return unwrap(await api().admin.inbox({ personId }).reply.post(input))
}

/**
 * A new letter and its files in one request.
 *
 * Multipart rather than the typed client, for the same reason as the upload
 * below: Eden serialises a body as JSON, and bytes have to arrive as files for
 * the route to read them back with `formData()`. The letter itself rides along
 * as one JSON field, so the server still validates it with the same schema.
 */
export async function compose(
  input: ComposeInput,
  files: File[] = [],
): Promise<{ personId: string; messageId: string; sent: boolean }> {
  const body = new FormData()

  body.append('message', JSON.stringify(input))
  for (const file of files) body.append('file', file)

  return unwrapUpload(
    await fetch('/api/admin/inbox/compose', { method: 'POST', body, credentials: 'same-origin' }),
  )
}

export async function setMessageRead(
  personId: string,
  messageId: string,
  read: boolean,
): Promise<void> {
  const route = api().admin.inbox({ personId }).messages({ messageId })

  unwrap(await (read ? route.read.post() : route.unread.post()))
}

/* -------------------------------------------------------------------------- */
/* Settings and files                                                         */
/* -------------------------------------------------------------------------- */

export async function saveSignature(input: SignatureInput): Promise<InboxSettings> {
  return unwrap<InboxSettings>(await api().admin.inbox.settings.signature.put(input))
}

export async function saveSnippets(input: SnippetsInput): Promise<InboxSettings> {
  return unwrap<InboxSettings>(await api().admin.inbox.settings.snippets.put(input))
}

/**
 * Sent as multipart rather than through the typed client: Eden serialises a
 * body as JSON, and the bytes have to arrive as a file for the route to read
 * them back with `request.formData()`.
 */
export async function uploadAttachment(personId: string, file: File) {
  const body = new FormData()

  body.append('file', file)

  return unwrapUpload<{ id: string; filename: string; bytes: number; url: string }>(
    await fetch(`/api/admin/inbox/${personId}/attachments`, {
      method: 'POST',
      body,
      credentials: 'same-origin',
    }),
  )
}

/**
 * The same envelope `response.ts` unwraps, for the two routes that cannot use
 * the typed client. The server's own sentence is kept: "Files can only be
 * stored on the live site" is worth more than "the request failed".
 */
async function unwrapUpload<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as { message?: string; data?: T }

  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.message ?? 'That did not work')
  }

  return payload.data
}

export async function deleteAttachment(personId: string, attachmentId: string): Promise<void> {
  unwrap(await api().admin.inbox({ personId }).attachments({ attachmentId }).delete())
}
