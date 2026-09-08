import { site } from '#/frontend/content/site'
import { cn } from '#/frontend/lib/utils'

/**
 * The site's signature, exactly as on the original site: a white rounded
 * frame, a gradient blue blob that morphs and slowly turns behind a soft
 * pulsing glow, and the cutout portrait standing in front of it. Pure CSS
 * (see `.portrait-*` in styles.css); stops under `prefers-reduced-motion`.
 */
export function PortraitBlob({ alt, className }: { alt: string; className?: string }) {
  return (
    <div className={cn('portrait-outer', className)}>
      <div className="portrait-blob-clip" aria-hidden="true">
        <div className="portrait-blob-anim" />
        <div className="portrait-blob-glow" />
      </div>
      <div className="portrait-photo-frame">
        <img src={site.heroPortrait} alt={alt} className="portrait-cutout" width={1000} height={966} fetchPriority="high" />
      </div>
    </div>
  )
}
