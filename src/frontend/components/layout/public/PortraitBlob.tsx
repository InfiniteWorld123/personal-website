import { site } from '#/frontend/content/site'
import { useTilt } from '#/frontend/motion'
import { cn } from '#/frontend/lib/utils'

/**
 * The site's signature, exactly as on the original site: a white rounded
 * frame, a gradient blue blob that morphs and slowly turns behind a soft
 * pulsing glow, and the cutout portrait standing in front of it. Pure CSS
 * (see `.portrait-*` in styles.css); stops under `prefers-reduced-motion`.
 *
 * On a desktop pointer the whole frame leans towards the cursor and a blue
 * light passes over the photo. The angle is smaller than on the cards: a face
 * tolerates far less perspective than a rectangle before it looks wrong.
 */
const PORTRAIT_BASE = site.heroPortrait.replace(/\.png$/, '')

/* The cutout is 97% of `.portrait-outer`, whose widths are in styles.css. */
const PORTRAIT_SIZES = '(min-width: 1280px) 524px, (min-width: 1024px) 37vw, (min-width: 768px) 41vw, 86vw'

export function PortraitBlob({ alt, className }: { alt: string; className?: string }) {
  const tilt = useTilt<HTMLDivElement>({ max: 9, spot: 0.34 })

  return (
    <div className={cn('portrait-outer', className)} data-tilt ref={tilt}>
      <div className="portrait-blob-clip" aria-hidden="true">
        <div className="portrait-blob-anim" />
        <div className="portrait-blob-glow" />
      </div>
      <div className="portrait-photo-frame">
        {/*
         * The PNG is the fallback and the image search engines see; browsers
         * that read AVIF or WebP take a copy a fraction of its size. The frame
         * is never wider than 540px, so 560w serves ordinary screens and
         * 1000w (the PNG's own width) the sharp ones.
         */}
        <picture>
          <source type="image/avif" srcSet={`${PORTRAIT_BASE}-560.avif 560w, ${PORTRAIT_BASE}-1000.avif 1000w`} sizes={PORTRAIT_SIZES} />
          <source type="image/webp" srcSet={`${PORTRAIT_BASE}-560.webp 560w, ${PORTRAIT_BASE}-1000.webp 1000w`} sizes={PORTRAIT_SIZES} />
          <img src={site.heroPortrait} alt={alt} className="portrait-cutout" width={1000} height={966} fetchPriority="high" />
        </picture>
      </div>
      <span className="portrait-spot" aria-hidden="true" />
    </div>
  )
}
