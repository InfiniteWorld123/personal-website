import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '#/backend2/contracts/pagination.contract'
import type {
  Language,
  OwnerBlogListItem,
  OwnerBlogPost,
  OwnerBlogTag,
  OwnerCommentPage,
  OwnerCommentThread,
  PublicBlogPost,
} from '#/backend2/contracts/blog.contract'
import { ApiRequestError } from '#/frontend/api/response'
import {
  type ArticlesQuery,
  type CommentsQuery,
  type PreviewVersion,
  type ScheduleInput,
  type TagInput,
  type TagsQuery,
  cancelArticleSchedule,
  checkArticleSlug,
  createArticle,
  createTag,
  deleteArticle,
  deleteComment,
  deleteTag,
  discardArticleChanges,
  listArticles,
  listComments,
  listTags,
  markCommentsSeen,
  previewArticle,
  publishArticle,
  readArticle,
  readComment,
  replyToComment,
  saveArticle,
  saveTag,
  scheduleArticle,
  setArticleComments,
  unpublishArticle,
} from './api'

/**
 * What Blog reads, and what is re-read after each write.
 *
 * One prefix for the module, invalidated whole after every write: a publish
 * changes a row's state and its tag's live count, a tag rename changes every
 * article that carries it, and a deleted comment changes two counters. A
 * narrower invalidation would leave a stale "Live" or "3 new" on screen — the
 * labels here that must never be wrong.
 */
export const blogKeys = {
  all: ['backend2', 'blog'] as const,
  articles: (query: ArticlesQuery) => [...blogKeys.all, 'articles', query] as const,
  article: (id: string) => [...blogKeys.all, 'article', id] as const,
  preview: (id: string, language: Language, version: PreviewVersion, revision: number) =>
    [...blogKeys.all, 'preview', id, language, version, revision] as const,
  slug: (slug: string, id: string) => [...blogKeys.all, 'slug', slug, id] as const,
  tags: (query: TagsQuery) => [...blogKeys.all, 'tags', query] as const,
  comments: (query: CommentsQuery) => [...blogKeys.all, 'comments', query] as const,
  comment: (id: string) => [...blogKeys.all, 'comment', id] as const,
  newComments: () => [...blogKeys.all, 'new-comments'] as const,
}

/** Anything the server answered on purpose is taken at its word. */
const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

export const useArticles = (query: ArticlesQuery, enabled = true) =>
  useQuery<Page<OwnerBlogListItem>>({
    queryKey: blogKeys.articles(query),
    queryFn: () => listArticles(query),
    placeholderData: (previous) => previous,
    enabled,
    retry,
  })

export const useArticle = (id: string) =>
  useQuery<OwnerBlogPost>({ queryKey: blogKeys.article(id), queryFn: () => readArticle(id), retry })

export const useArticlePreview = (input: {
  id: string
  language: Language
  version: PreviewVersion
  revision: number
}) =>
  useQuery<PublicBlogPost>({
    queryKey: blogKeys.preview(input.id, input.language, input.version, input.revision),
    queryFn: () => previewArticle(input.id, input.language, input.version),
    placeholderData: (previous) => previous,
    retry,
  })

/** Is the address free? Asked only for a valid one, a moment after typing stops. */
export const useArticleSlugCheck = (slug: string, id: string, enabled: boolean) =>
  useQuery({
    queryKey: blogKeys.slug(slug, id),
    queryFn: () => checkArticleSlug(slug, id),
    enabled,
    staleTime: 10_000,
    retry: false,
  })

export const useTags = (query: TagsQuery) =>
  useQuery<Page<OwnerBlogTag>>({
    queryKey: blogKeys.tags(query),
    queryFn: () => listTags(query),
    placeholderData: (previous) => previous,
    retry,
  })

export const useComments = (query: CommentsQuery) =>
  useQuery<OwnerCommentPage>({
    queryKey: blogKeys.comments(query),
    queryFn: () => listComments(query),
    placeholderData: (previous) => previous,
    retry,
  })

export const useCommentThread = (id: string | null) =>
  useQuery<OwnerCommentThread>({
    queryKey: blogKeys.comment(id ?? ''),
    queryFn: () => readComment(id!),
    enabled: id !== null,
    retry,
  })

/**
 * How many comments the owner has not seen, for the sidebar and the tab.
 *
 * `docs/v2/blog.md`: "Dashboard visibility of new comments is enough." So it
 * is read again every minute and whenever the window comes back, and it is
 * quiet when it fails — a count is not worth an error on every screen,
 * including the ones where Backend2 is not running.
 */
export const useNewCommentCount = () =>
  useQuery({
    queryKey: blogKeys.newComments(),
    queryFn: async () => (await listComments({ status: 'new', pageSize: 1 })).newTotal,
    // Where Backend2 does not answer — a deployment without it — asking every
    // minute would only repeat the same refusal, so it stops until the next visit.
    refetchInterval: (query) => (query.state.status === 'error' ? false : 60_000),
    staleTime: 20_000,
    retry: false,
  })

const useRefresh = () => {
  const client = useQueryClient()

  return () => client.invalidateQueries({ queryKey: blogKeys.all })
}

/**
 * Writes that return the whole article put it straight into the cache: the
 * editor sends `draftRevision` back on the next save, and a value one behind
 * the server's would surface as a 409.
 */
const useArticleMutation = <TInput>(run: (input: TInput) => Promise<OwnerBlogPost>) => {
  const client = useQueryClient()
  const refresh = useRefresh()

  return useMutation({
    mutationFn: run,
    onSuccess: async (article) => {
      client.setQueryData(blogKeys.article(article.id), article)
      await refresh()
    },
  })
}

const useWrite = <TInput, TResult>(run: (input: TInput) => Promise<TResult>) => {
  const refresh = useRefresh()

  return useMutation({ mutationFn: run, onSuccess: () => refresh() })
}

export const useCreateArticle = () =>
  useArticleMutation((input: Parameters<typeof createArticle>[0]) => createArticle(input))

export const useSaveArticle = () =>
  useArticleMutation((input: { id: string } & Parameters<typeof saveArticle>[1]) => {
    const { id, ...patch } = input

    return saveArticle(id, patch)
  })

export const usePublishArticle = () =>
  useArticleMutation((input: { id: string; draftRevision: number }) => publishArticle(input.id, input.draftRevision))

export const useScheduleArticle = () =>
  useArticleMutation((input: { id: string } & ScheduleInput) => {
    const { id, ...schedule } = input

    return scheduleArticle(id, schedule)
  })

export const useCancelSchedule = () => useArticleMutation((id: string) => cancelArticleSchedule(id))

export const useUnpublishArticle = () => useArticleMutation((id: string) => unpublishArticle(id))

export const useDiscardArticleChanges = () =>
  useArticleMutation((input: { id: string; draftRevision: number }) =>
    discardArticleChanges(input.id, input.draftRevision),
  )

export const useArticleComments = () =>
  useArticleMutation((input: { id: string; enabled: boolean }) => setArticleComments(input.id, input.enabled))

export const useDeleteArticle = () => {
  const refresh = useRefresh()

  return useMutation({
    mutationFn: (id: string) => deleteArticle(id),
    // Not awaited: one of the refetches is the editor asking for the article
    // that was just deleted, and the caller is waiting to navigate away.
    onSuccess: () => {
      void refresh()
    },
  })
}

export const useCreateTag = () => useWrite((input: TagInput) => createTag(input))

export const useSaveTag = () => useWrite(({ id, ...tag }: { id: string } & TagInput) => saveTag(id, tag))

export const useDeleteTag = () => useWrite((id: string) => deleteTag(id))

export const useReplyToComment = () =>
  useWrite((input: { id: string; body: string }) => replyToComment(input.id, input.body))

export const useDeleteComment = () => useWrite((id: string) => deleteComment(id))

export const useMarkCommentsSeen = () =>
  useWrite((input: Parameters<typeof markCommentsSeen>[0]) => markCommentsSeen(input))
