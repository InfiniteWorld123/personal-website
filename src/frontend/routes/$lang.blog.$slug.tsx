import { createFileRoute, notFound } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
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

    return buildHead({
      language,
      path: `/blog/${params.slug}`,
      title: `${post.title} · ${getContent(language).blog.eyebrow}`,
      description: post.excerpt,
      // The cover doubles as the social card when the article has one.
      image: post.cover?.src,
      imageSize: post.cover ?? undefined,
      article: {
        title: post.title,
        publishedOn: post.publishedOn,
        readingMinutes: post.readingMinutes,
        tags: post.tags.map((tag) => tag.name),
      },
    })
  },
  component: PostRoute,
})

function PostRoute() {
  return <PostPage post={Route.useLoaderData().post} />
}
