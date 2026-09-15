import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchContentRevisions,
  fetchContentSnapshot,
  fetchPublishDiff,
  markContentReviewed,
  publishContent,
  resetContentField,
  revertContentRevision,
  saveContentDraft,
} from '#/frontend/api/content.api'
import type { ContentSnapshot } from '#/shared/types/content.types'
import type {
  ContentResetInput,
  ContentReviewedInput,
  ContentSaveInput,
} from '#/shared/validation/content.validation'

export const contentSnapshotQuery = () =>
  queryOptions({ queryKey: ['content', 'snapshot'], queryFn: fetchContentSnapshot })

export const contentRevisionsQuery = (enabled: boolean) =>
  queryOptions({
    queryKey: ['content', 'revisions'],
    queryFn: fetchContentRevisions,
    enabled,
  })

export const publishDiffQuery = (enabled: boolean) =>
  queryOptions({ queryKey: ['content', 'diff'], queryFn: fetchPublishDiff, enabled })

/**
 * Every write returns the whole snapshot, so the cache is replaced rather than
 * invalidated: a save that triggered a refetch would race the next keystroke,
 * and the editor would flicker back to the wording from one letter ago.
 */
const useSnapshotMutation = <TInput>(mutationFn: (input: TInput) => Promise<ContentSnapshot>) => {
  const client = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: (snapshot) => {
      client.setQueryData(contentSnapshotQuery().queryKey, snapshot)
      client.invalidateQueries({ queryKey: ['content', 'revisions'] })
      client.invalidateQueries({ queryKey: ['content', 'diff'] })
    },
  })
}

export const useSaveDraft = () => useSnapshotMutation((input: ContentSaveInput) => saveContentDraft(input))

export const useResetField = () =>
  useSnapshotMutation((input: ContentResetInput) => resetContentField(input))

export const useMarkReviewed = () =>
  useSnapshotMutation((input: ContentReviewedInput) => markContentReviewed(input))

export const useRevertRevision = () =>
  useSnapshotMutation((revisionId: string) => revertContentRevision(revisionId))

export const usePublishContent = () => useSnapshotMutation(() => publishContent())
