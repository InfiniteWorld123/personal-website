import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { WorkPage } from '#/frontend/pages/public/work/WorkPage'
import { parseProjectPage } from '#/frontend/features/work/project-list'

export const Route = createFileRoute('/$lang/work/')({
  validateSearch: (search: Record<string, unknown>): { page?: number } => ({ page: parseProjectPage(search.page) }),
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).work
    return buildHead({ language, path: '/work', ...meta })
  },
  component: WorkPage,
})
