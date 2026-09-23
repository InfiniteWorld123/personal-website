import { describe, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'

/**
 * An empty database, and the migrations run against it in order.
 *
 * This suite exists because of a real failure: `0001_projects.sql` was applied
 * to the owner's development database on 21 Sep 2026 and never committed, so
 * for a day any fresh database was missing the Projects tables while the
 * owner's had them. Nothing failed loudly — the two simply differed.
 *
 * PGlite is PostgreSQL compiled to WebAssembly: a real server, in this
 * process, with no account and no connection string. So "a new database can be
 * built from this repository alone" is a thing the suite can actually check,
 * rather than something someone has to remember to try.
 */

const { readMigrationSql } = await import('#/backend2/db/migrate')

describe('building a database from nothing', () => {
  it('applies every migration in order, and the numbers say the order', async () => {
    const files = await readMigrationSql()

    expect(files.map((f) => f.name)).toEqual([
      '0001_projects.sql',
      '0002_auth.sql',
      '0003_media.sql',
      '0004_projects_media.sql',
      '0005_services.sql',
      '0006_blog.sql',
      '0007_content.sql',
      '0008_clients.sql',
    ])

    // The runner sorts by filename, so the names have to sort into the order
    // the dependencies need. Stated as a test because a file added later with
    // a lower number would run before these on a new database and never at
    // all on an existing one.
    expect([...files.map((f) => f.name)].sort()).toEqual(files.map((f) => f.name))
  })

  /*
   * Generous, because each of these builds a whole PostgreSQL in WebAssembly
   * and runs three migrations through it. Slow on purpose beats fast and
   * mocked: the point is that the real SQL works on a real empty database.
   */
  it('leaves a schema the whole application can use, and no rows at all', { timeout: 60_000 }, async () => {
    const database = new PGlite()

    try {
      for (const file of await readMigrationSql()) {
        // One at a time, so a failure names the migration that caused it.
        await database.exec(file.sql).catch((error: unknown) => {
          throw new Error(
            `${file.name} failed on an empty database: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        })
      }

      const { rows } = (await database.query(
        `SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename LIKE 'v2\\_%'
          ORDER BY tablename`,
      )) as { rows: Array<{ tablename: string }> }

      const tables = rows.map((row) => row.tablename)

      // Projects, from the recovered 0001.
      expect(tables).toContain('v2_projects')
      expect(tables).toContain('v2_project_versions')
      expect(tables).toContain('v2_media_objects')
      // Auth, from 0002.
      expect(tables).toContain('v2_owner')
      expect(tables).toContain('v2_owner_sessions')
      // The shared vault, from 0003.
      expect(tables).toContain('v2_media_assets')
      expect(tables).toContain('v2_media_folders')
      expect(tables).toContain('v2_media_references')
      // The Services catalogue, from 0005.
      expect(tables).toContain('v2_services')
      expect(tables).toContain('v2_service_versions')
      expect(tables).toContain('v2_service_texts')
      expect(tables).toContain('v2_service_slugs')
      // The Blog, from 0006.
      expect(tables).toContain('v2_blog_posts')
      expect(tables).toContain('v2_blog_post_versions')
      expect(tables).toContain('v2_blog_post_texts')
      expect(tables).toContain('v2_blog_post_tags')
      expect(tables).toContain('v2_blog_tags')
      expect(tables).toContain('v2_blog_tag_names')
      expect(tables).toContain('v2_blog_comments')
      // Static copy, from 0007.
      expect(tables).toContain('v2_content_values')
      expect(tables).toContain('v2_content_history')
      expect(tables).toContain('v2_content_review_flags')
      expect(tables).toContain('v2_content_imports')
      // The Client directory, from 0008.
      expect(tables).toContain('v2_clients')
      expect(tables).toContain('v2_client_lead_links')
      expect(tables).toContain('v2_niches')

      /*
       * A migration builds structure. Anything that arrived with rows would be
       * data in source control — a fixture, a test account, or worse — so the
       * count is asserted rather than assumed.
       */
      for (const table of tables) {
        const counted = (await database.query(`SELECT count(*) AS total FROM ${table}`)) as {
          rows: Array<{ total: string | number }>
        }

        expect(Number(counted.rows[0]?.total ?? 0), `${table} should start empty`).toBe(0)
      }
    } finally {
      await database.close()
    }
  })

  it('keeps the two halves of Projects able to reference each other', { timeout: 60_000 }, async () => {
    const database = new PGlite()

    try {
      for (const file of await readMigrationSql()) await database.exec(file.sql)

      /*
       * `v2_projects` points at `v2_project_versions` and that table points
       * straight back. Both keys are deferrable, so one transaction can write
       * the pair; this is what the ordering inside 0001 exists to preserve.
       */
      await database.exec(`
        BEGIN;
        SET CONSTRAINTS ALL DEFERRED;
        INSERT INTO v2_projects (id, position) VALUES ('11111111-1111-4111-8111-111111111111', 1);
        INSERT INTO v2_project_versions (id, project_id, kind, type)
          VALUES ('22222222-2222-4222-8222-222222222222',
                  '11111111-1111-4111-8111-111111111111', 'draft', 'client');
        UPDATE v2_projects SET draft_version_id = '22222222-2222-4222-8222-222222222222'
          WHERE id = '11111111-1111-4111-8111-111111111111';
        COMMIT;
      `)

      const { rows } = (await database.query(
        'SELECT draft_version_id FROM v2_projects',
      )) as { rows: Array<{ draft_version_id: string }> }

      expect(rows[0]?.draft_version_id).toBe('22222222-2222-4222-8222-222222222222')
    } finally {
      await database.close()
    }
  })

  /*
   * 0004 is the migration that joined Projects to the shared vault. The column
   * it repointed is the one thing standing between "a file a project uses" and
   * "a file anyone may delete", so the shape is asserted rather than assumed.
   */
  it('points project images at the shared Media vault', { timeout: 60_000 }, async () => {
    const database = new PGlite()

    try {
      for (const file of await readMigrationSql()) await database.exec(file.sql)

      const { rows } = (await database.query(`
        SELECT pg_get_constraintdef(con.oid) AS def
          FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
         WHERE c.relname = 'v2_project_images' AND con.contype = 'f'
      `)) as { rows: Array<{ def: string }> }

      const definitions = rows.map((row) => row.def)

      // The old project-scoped table is no longer a destination...
      expect(definitions.some((def) => def.includes('v2_media_objects'))).toBe(false)
      // ...and the vault refuses to let go of a file a version still uses.
      expect(
        definitions.some(
          (def) => def.includes('v2_media_assets') && def.includes('ON DELETE RESTRICT'),
        ),
      ).toBe(true)

      const { rows: columns } = (await database.query(`
        SELECT column_name FROM information_schema.columns
         WHERE table_name = 'v2_projects' AND column_name = 'published_draft_revision'
      `)) as { rows: Array<{ column_name: string }> }

      expect(columns).toHaveLength(1)
    } finally {
      await database.close()
    }
  })
})
