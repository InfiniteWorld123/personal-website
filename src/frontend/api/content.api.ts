import type {
  ContentDiffEntry,
  ContentRevision,
  ContentSnapshot,
} from '#/shared/types/content.types'
import type {
  ContentResetInput,
  ContentReviewedInput,
  ContentSaveInput,
} from '#/shared/validation/content.validation'
import { api } from './client'
import { unwrap } from './response'

/**
 * Eden Treaty turns anything that parses as an ISO date into a `Date` — the
 * trap `booking.api.ts` documents. Timestamps here are rendered, so they are put
 * back to strings on the way in.
 */
const toInstant = <T extends string | null>(value: T): T =>
  ((value as unknown) instanceof Date ? (value as unknown as Date).toISOString() : value) as T

const normaliseSnapshot = (snapshot: ContentSnapshot): ContentSnapshot => ({
  ...snapshot,
  fields: snapshot.fields.map((field) => ({ ...field, updatedAt: toInstant(field.updatedAt) })),
})

export async function fetchContentSnapshot(): Promise<ContentSnapshot> {
  return normaliseSnapshot(unwrap<ContentSnapshot>(await api().admin.content.get()))
}

export async function fetchContentRevisions(): Promise<ContentRevision[]> {
  const revisions = unwrap<ContentRevision[]>(await api().admin.content.revisions.get())

  return revisions.map((revision) => ({ ...revision, createdAt: toInstant(revision.createdAt) }))
}

export async function fetchPublishDiff(): Promise<ContentDiffEntry[]> {
  return unwrap<ContentDiffEntry[]>(await api().admin.content.diff.get())
}

export async function saveContentDraft(input: ContentSaveInput): Promise<ContentSnapshot> {
  return normaliseSnapshot(unwrap<ContentSnapshot>(await api().admin.content.draft.put(input)))
}

export async function resetContentField(input: ContentResetInput): Promise<ContentSnapshot> {
  return normaliseSnapshot(unwrap<ContentSnapshot>(await api().admin.content.reset.post(input)))
}

export async function markContentReviewed(input: ContentReviewedInput): Promise<ContentSnapshot> {
  return normaliseSnapshot(unwrap<ContentSnapshot>(await api().admin.content.reviewed.post(input)))
}

export async function revertContentRevision(revisionId: string): Promise<ContentSnapshot> {
  return normaliseSnapshot(
    unwrap<ContentSnapshot>(await api().admin.content.revert.post({ revisionId })),
  )
}

export async function publishContent(): Promise<ContentSnapshot> {
  return normaliseSnapshot(unwrap<ContentSnapshot>(await api().admin.content.publish.post()))
}
