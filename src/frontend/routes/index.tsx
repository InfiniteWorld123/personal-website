import { createFileRoute } from '@tanstack/react-router'
import { PortfolioPage } from '#/frontend/pages/public/portfolio-page'

export const Route = createFileRoute('/')({ component: PortfolioPage })
