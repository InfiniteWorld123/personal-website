import { createFileRoute, notFound } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import blogV2Css from '#/frontend/features/blog/blog-v2.css?url'
import { fetchPublishedPost } from '#/frontend/features/blog/server/published-posts'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { PostPage } from '#/frontend/pages/public/blog/PostPage'

export const Route = createFileRoute('/$lang/blog/$slug')({
  loader: async ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const post = await fetchPublishedPost({ data: { language, slug: params.slug } })

    // An unpublished or deleted post is a 404, not an empty page.
    if (!post) throw notFound()

    return { post }
  },
  head: ({ params, loaderData }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    if (!loaderData) return {}

    const { post } = loaderData
    const head = buildHead({
      language,
      path: `/blog/${params.slug}`,
      // Backend2 resolves the owner's search title and description per
      // language, falling back to the title and summary; legacy has neither.
      title: `${post.seo?.title ?? post.title} · ${getContent(language).blog.eyebrow}`,
      description: post.seo?.description ?? post.excerpt,
      // The cover doubles as the social card when the article has one.
      image: post.cover?.src,
      imageSize:
        post.cover?.width && post.cover.height
          ? { width: post.cover.width, height: post.cover.height }
          : undefined,
      article: {
        title: post.title,
        publishedOn: post.publishedOn,
        updatedOn: post.updatedOn ?? undefined,
        readingMinutes: post.readingMinutes,
        tags: post.tags.map((tag) => tag.name),
      },
    })

    // The comment section, the table and the video styles exist only on a
    // Backend2 article; the legacy page loads exactly what it always did.
    return post.source === 'v2'
      ? { ...head, links: [...head.links, { rel: 'stylesheet', href: blogV2Css }] }
      : head
  },
  component: PostRoute,
})

function PostRoute() {
  return <PostPage post={Route.useLoaderData().post} />
}
