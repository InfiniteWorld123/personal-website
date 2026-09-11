import { env } from '#/shared/env'

export type ImageVariant = {
  width: number
  /** Omitted for a plain width resize, which keeps the aspect ratio. */
  height?: number
  fit?: 'scale-down' | 'contain' | 'cover'
}

const publicOrigin = (): string => (env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '')

/** The stored object, unmodified. */
export const imageUrl = (key: string): string => `${publicOrigin()}/${key}`

/**
 * Cloudflare Image Transformations live at `/cdn-cgi/image/` on a Cloudflare
 * zone. A bucket served from the free `*.r2.dev` hostname is not on one, so
 * there we hand back the original rather than a URL that would 404.
 */
const supportsTransformations = (): boolean => {
  const origin = publicOrigin()

  return origin !== '' && !origin.includes('.r2.dev')
}

export const imageVariantUrl = (key: string, variant: ImageVariant): string => {
  if (!supportsTransformations()) return imageUrl(key)

  const options = [
    `width=${variant.width}`,
    ...(variant.height ? [`height=${variant.height}`] : []),
    `fit=${variant.fit ?? 'scale-down'}`,
    // Serves AVIF or WebP to browsers that accept them, whatever we stored.
    'format=auto',
  ].join(',')

  return `${publicOrigin()}/cdn-cgi/image/${options}/${key}`
}

/** Widths a project screenshot is actually laid out at, for `srcset`. */
export const PROJECT_IMAGE_WIDTHS = [400, 800, 1200, 1600] as const

export const imageSrcSet = (key: string, widths: readonly number[] = PROJECT_IMAGE_WIDTHS): string =>
  widths.map((width) => `${imageVariantUrl(key, { width })} ${width}w`).join(', ')
