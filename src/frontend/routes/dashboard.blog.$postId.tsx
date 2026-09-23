import { createFileRoute } from '@tanstack/react-router'
import type { Language } from '#/backend2/contracts/blog.contract'
import { BlogEditorPage } from '#/frontend/pages/dashboard/blog/BlogEditorPage'

/** One article, and everything about it, on one page. `?language=` opens that language's tab. */
export const Route = createFileRoute('/dashboard/blog/$postId')({
  validateSearch: (search: Record<string, unknown>): { language?: Language } => ({
    language: search.language === 'de' || search.language === 'en' || search.language === 'ar' ? search.language : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Edit article · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: BlogEditorPage,
})
