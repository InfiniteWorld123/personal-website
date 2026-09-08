import { site } from '#/frontend/content/site'
import { cn } from '#/frontend/lib/utils'

/**
 * The site's signature: the portrait inside a slowly morphing blue blob,
 * with a soft blue light pulsing behind it, on a white rounded card. The
 * photograph already sits on the same electric blue, so the blob's edge is
 * the photo's edge. Pure CSS; stops under `prefers-reduced-motion`.
 */
export function PortraitBlob({ alt, className }: { alt: string; className?: string }) {
  return (
    <div className={cn('portrait-outer', className)}>
      <div className="portrait-blob-glow" aria-hidden="true" />
      <div className="portrait-blob-photo">
        <img src={site.heroPortrait} alt={alt} width={1536} height={1024} fetchPriority="high" />
      </div>
    </div>
  )
}
