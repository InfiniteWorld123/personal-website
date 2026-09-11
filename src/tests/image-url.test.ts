import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `env` is built once at module load, so each case sets the variables it
 * needs and then imports the module fresh.
 */
const loadUrlModule = async (publicUrl: string | undefined) => {
  vi.resetModules()
  vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-value-at-least-32-chars')
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
  vi.stubEnv('BASE_URL', 'http://localhost:3000')
  vi.stubEnv('DATABASE_URL', 'postgresql://user:pass@127.0.0.1:5433/test')
  vi.stubEnv('R2_PUBLIC_URL', publicUrl ?? '')

  return import('#/backend/shared/image-storage/url')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('image URLs', () => {
  it('builds a transformation URL on a Cloudflare zone', async () => {
    const { imageUrl, imageVariantUrl } = await loadUrlModule('https://media.yamanwarda.de')

    expect(imageUrl('projects/abc.jpg')).toBe('https://media.yamanwarda.de/projects/abc.jpg')
    expect(imageVariantUrl('projects/abc.jpg', { width: 800 })).toBe(
      'https://media.yamanwarda.de/cdn-cgi/image/width=800,fit=scale-down,format=auto/projects/abc.jpg',
    )
    expect(imageVariantUrl('projects/abc.jpg', { width: 400, height: 300, fit: 'cover' })).toBe(
      'https://media.yamanwarda.de/cdn-cgi/image/width=400,height=300,fit=cover,format=auto/projects/abc.jpg',
    )
  })

  it('hands back the original on an r2.dev bucket, where transformations do not exist', async () => {
    const { imageVariantUrl } = await loadUrlModule('https://pub-abc123.r2.dev')

    expect(imageVariantUrl('projects/abc.jpg', { width: 800 })).toBe(
      'https://pub-abc123.r2.dev/projects/abc.jpg',
    )
  })

  it('does not double the slash when the configured origin ends with one', async () => {
    const { imageUrl } = await loadUrlModule('https://media.yamanwarda.de/')

    expect(imageUrl('projects/abc.jpg')).toBe('https://media.yamanwarda.de/projects/abc.jpg')
  })

  it('builds a srcset across the laid-out widths', async () => {
    const { imageSrcSet } = await loadUrlModule('https://media.yamanwarda.de')
    const srcset = imageSrcSet('projects/abc.jpg')

    expect(srcset.split(', ')).toHaveLength(4)
    expect(srcset).toContain('width=1600,fit=scale-down,format=auto/projects/abc.jpg 1600w')
  })
})
