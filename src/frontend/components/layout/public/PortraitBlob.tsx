import { site } from '#/frontend/content/site'
import { cn } from '#/frontend/lib/utils'

/**
 * The site's signature: the cutout portrait in front of a morphing,
 * glowing blue blob. The blob is pure CSS (see `.portrait-*` in styles.css)
 * and stops under `prefers-reduced-motion`.
 */
export function PortraitBlob({ alt, className }: { alt: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-4', className)}>
      <div className="portrait-outer">
        <div className="portrait-blob-clip" aria-hidden="true">
          <div className="portrait-blob-anim" />
          <div className="portrait-blob-glow" />
        </div>
        <div className="portrait-photo-frame">
          <img src={site.heroPortrait} alt={alt} className="portrait-cutout" width={1536} height={2040} />
        </div>
      </div>
    </div>
  )
}
