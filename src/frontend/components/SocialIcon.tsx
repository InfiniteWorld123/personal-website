import type { ComponentType, ReactNode, SVGProps } from 'react'
import { Github, Globe, Instagram, Linkedin, Mail, Youtube, type LucideProps } from 'lucide-react'
import type { LinkPlatform } from '#/backend2/contracts/content.contract'

/**
 * One icon per profile-link platform, drawn as one set: 24-unit grid, 2px
 * round stroke, `currentColor`. Lucide supplies the platforms it has; X,
 * WhatsApp and Telegram are Tabler's outline marks (MIT, © Paweł Kuna), which
 * share Lucide's grid and stroke, so the set reads as one family.
 */

const drawn = (children: ReactNode) =>
  function DrawnIcon({ className, ...props }: LucideProps) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...(props as SVGProps<SVGSVGElement>)}
      >
        {children}
      </svg>
    )
  }

const XMark = drawn(
  <>
    <path d="M4 4l11.733 16h4.267l-11.733 -16z" />
    <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772" />
  </>,
)

const WhatsApp = drawn(
  <>
    <path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9" />
    <path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a.5 .5 0 0 0 0 1" />
  </>,
)

const Telegram = drawn(<path d="M15 10l-4 4l6 6l4 -16l-18 7l4 2l2 6l3 -4" />)

const ICON: Record<LinkPlatform | 'email', ComponentType<LucideProps>> = {
  github: Github,
  linkedin: Linkedin,
  instagram: Instagram,
  x: XMark,
  youtube: Youtube,
  whatsapp: WhatsApp,
  telegram: Telegram,
  website: Globe,
  email: Mail,
}

/** Decorative: the link beside it always carries the platform's name. */
export function SocialIcon({ platform, className }: { platform: LinkPlatform | 'email'; className?: string }) {
  const Icon = ICON[platform]

  return <Icon className={className} aria-hidden="true" />
}
