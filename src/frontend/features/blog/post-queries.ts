import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createAdminPost,
  createAdminTag,
  deleteAdminPost,
  deleteAdminTag,
  fetchAdminPost,
  fetchAdminPosts,
  fetchAdminTags,
  fetchPostProjectOptions,
  updateAdminPost,
  updateAdminTag,
} from '#/frontend/api/post.api'
import type { PostFilterInput, PostWriteInput, TagWriteInput } from '#/shared/validation/post.validation'

export const postKeys = {
  all: ['admin', 'blog'] as const,
  lists: () => [...postKeys.all, 'list'] as const,
  list: (filter: PostFilterInput) => [...postKeys.lists(), filter] as const,
  detail: (id: string) => [...postKeys.all, 'detail', id] as const,
  tags: () => [...postKeys.all, 'tags'] as const,
  projects: () => [...postKeys.all, 'projects'] as const,
}

export const adminPostsQuery = (filter: PostFilterInput) =>
  queryOptions({ queryKey: postKeys.list(filter), queryFn: () => fetchAdminPosts(filter) })

export const adminPostQuery = (id: string) =>
  queryOptions({ queryKey: postKeys.detail(id), queryFn: () => fetchAdminPost(id) })

export const adminTagsQuery = () =>
  queryOptions({ queryKey: postKeys.tags(), queryFn: fetchAdminTags })

export const postProjectsQuery = () =>
  queryOptions({ queryKey: postKeys.projects(), queryFn: fetchPostProjectOptions })

/**
 * Every write invalidates the lists, because a save can change the title, the
 * date, the tags, and whether the row belongs in the current filter at all.
 */
export const useSavePost = (id: string | null) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: PostWriteInput) => (id ? updateAdminPost(id, input) : createAdminPost(input)),
    onSuccess: (post) => {
      queryClient.setQueryData(postKeys.detail(post.id), post)
      void queryClient.invalidateQueries({ queryKey: postKeys.lists() })
    },
  })
}

export const useDeletePost = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteAdminPost(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: postKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: postKeys.lists() })
    },
  })
}

/**
 * Tag writes invalidate the post lists too: a renamed or deleted tag changes
 * what every row shows, and a deleted one changes which rows a filter matches.
 */
const invalidateTags = (queryClient: ReturnType<typeof useQueryClient>) => {
  void queryClient.invalidateQueries({ queryKey: postKeys.tags() })
  void queryClient.invalidateQueries({ queryKey: postKeys.lists() })
}

export const useSaveTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: TagWriteInput }) =>
      id ? updateAdminTag(id, input) : createAdminTag(input),
    onSuccess: () => invalidateTags(queryClient),
  })
}

export const useDeleteTag = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteAdminTag(id),
    onSuccess: () => invalidateTags(queryClient),
  })
}
