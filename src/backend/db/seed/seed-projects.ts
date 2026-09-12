import 'dotenv/config'

import { content } from '#/frontend/content'
import { projectOrder, projects } from '#/frontend/content/site'
import { PROJECT_LANGUAGES } from '#/shared/validation/project.validation'
import { closePool, getPool } from '../client'

/**
 * Lifts the three case studies out of `content/site.ts` and the language files
 * into the database, which owns them from now on. Written as a one-time
 * command rather than a migration because the source is TypeScript: hand-
 * copying three projects in three languages into SQL is how a typo gets
 * published.
 *
 * Idempotent. A slug already in the database is left exactly as it is, so
 * re-running this can never overwrite something edited in the admin.
 */
async function seedProjects() {
  const client = await getPool().connect()

  try {
    for (const [index, slug] of projectOrder.entries()) {
      const facts = projects[slug]

      await client.query('BEGIN')

      const existing = await client.query('SELECT id FROM projects WHERE slug = $1;', [slug])

      if (existing.rows[0]) {
        await client.query('ROLLBACK')
        console.log(`Skipped (already present): ${slug}`)
        continue
      }

      const created = await client.query<{ id: string }>(
        `INSERT INTO projects (slug, status, website_url, source_url, is_published, sort_order)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING id;`,
        [
          slug,
          facts.status,
          'website' in facts ? facts.website : null,
          'source' in facts ? facts.source : null,
          index,
        ],
      )

      const projectId = created.rows[0]!.id

      for (const [techIndex, name] of facts.stack.entries()) {
        await client.query(
          'INSERT INTO project_tech (project_id, name, sort_order) VALUES ($1, $2, $3);',
          [projectId, name, techIndex],
        )
      }

      const images = 'images' in facts ? (facts.images ?? []) : []

      for (const [imageIndex, image] of images.entries()) {
        const insertedImage = await client.query<{ id: string }>(
          `INSERT INTO project_images (project_id, src, width, height, is_cover, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`,
          // The first entry was the card's lead image; that is the cover now.
          [projectId, image.src, image.width, image.height, imageIndex === 0, imageIndex],
        )

        for (const language of PROJECT_LANGUAGES) {
          await client.query(
            'INSERT INTO project_image_translations (project_image_id, language, alt) VALUES ($1, $2, $3);',
            [insertedImage.rows[0]!.id, language, image.alt[language]],
          )
        }
      }

      for (const language of PROJECT_LANGUAGES) {
        const copy = content[language].work.items[slug]

        await client.query(
          `INSERT INTO project_translations
             (project_id, language, name, kind, summary, problem, approach, shows, features)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);`,
          [
            projectId,
            language,
            copy.name,
            copy.kind,
            copy.summary,
            copy.problem,
            copy.approach,
            copy.shows,
            copy.features,
          ],
        )
      }

      await client.query('COMMIT')
      console.log(`Seeded: ${slug} (${images.length} images, ${facts.stack.length} technologies)`)
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

try {
  await seedProjects()
  console.log('Projects are in the database.')
} finally {
  await closePool()
}
