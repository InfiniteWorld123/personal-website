-- Projects V2. See docs/v2/projects-backend.md.
--
-- Recovered on 22 Sep 2026, and that word is the important one.
--
-- This migration was applied to the owner's development database on
-- 21 Sep 2026 and recorded in `v2_schema_migrations`, but the FILE was never
-- committed and the Projects backend it belongs to does not exist in this
-- repository at all. A fresh `bun run db2:migrate` therefore built a database
-- without these tables while the owner's had them — two environments that
-- looked alike and were not.
--
-- So this file is not written from the design document. It is read back out of
-- the database that already holds the schema, through PostgreSQL's own
-- `pg_get_constraintdef` and `pg_get_indexdef`, so it recreates exactly what
-- is installed rather than what anyone intended. Two places where the two
-- differ, and the installed version wins here:
--
--   * `v2_media_objects` carries a `public_token`, which the document never
--     mentions.
--   * `v2_project_images.media_object_id` is a deferrable foreign key with the
--     default NO ACTION, not the `ON DELETE RESTRICT` the document describes.
--
-- Nothing here is new and nothing here is data: no rows, no secrets. On the
-- owner's database it will not run again, because its name is already in the
-- ledger. On an empty database it now runs first, which is the whole point.
--
-- The order below is not the order the catalogue reports them in. Every key a
-- foreign key can point at has to exist before it is pointed at, and
-- `v2_projects` references `v2_project_versions` while that table references
-- `v2_projects` straight back. So: all the tables, then the keys, then the
-- checks, then the references, then the indexes.
--
-- Note for whoever builds the Projects backend: the shared Media vault in
-- 0003 replaces `v2_media_objects` and the project-scoped cleanup around it.
-- These tables are the old shape, kept so the histories match — not the shape
-- to build on.


-- v2_projects
CREATE TABLE v2_projects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    position integer NOT NULL,
    lifecycle text DEFAULT 'active'::text NOT NULL,
    draft_version_id uuid,
    published_version_id uuid,
    first_published_at timestamp with time zone,
    published_at timestamp with time zone,
    archived_at timestamp with time zone,
    draft_revision integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- v2_project_versions
CREATE TABLE v2_project_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    kind text NOT NULL,
    slug text DEFAULT ''::text NOT NULL,
    type text NOT NULL,
    work_status text DEFAULT 'in_progress'::text NOT NULL,
    client_name text,
    show_client_name boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- v2_project_slugs
CREATE TABLE v2_project_slugs (
    slug text NOT NULL,
    project_id uuid NOT NULL,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- v2_project_texts
CREATE TABLE v2_project_texts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_id uuid NOT NULL,
    language text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    category_label text DEFAULT ''::text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    case_study jsonb
);

-- v2_media_objects
CREATE TABLE v2_media_objects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_id uuid NOT NULL,
    storage_key text NOT NULL,
    content_type text NOT NULL,
    byte_size integer NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    checksum text NOT NULL,
    public_token text NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- v2_project_images
CREATE TABLE v2_project_images (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_id uuid NOT NULL,
    media_object_id uuid NOT NULL,
    role text NOT NULL,
    position integer DEFAULT 0 NOT NULL
);

-- v2_project_image_texts
CREATE TABLE v2_project_image_texts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_image_id uuid NOT NULL,
    language text NOT NULL,
    alt text DEFAULT ''::text NOT NULL
);

-- v2_project_links
CREATE TABLE v2_project_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_id uuid NOT NULL,
    kind text NOT NULL,
    url text NOT NULL,
    is_public boolean DEFAULT false NOT NULL,
    position integer DEFAULT 0 NOT NULL
);

-- v2_project_link_texts
CREATE TABLE v2_project_link_texts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    project_link_id uuid NOT NULL,
    language text NOT NULL,
    label text DEFAULT ''::text NOT NULL
);

-- v2_project_tech
CREATE TABLE v2_project_tech (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    version_id uuid NOT NULL,
    name text NOT NULL,
    position integer DEFAULT 0 NOT NULL
);

-- Primary keys and unique constraints, before anything references them.
ALTER TABLE v2_projects ADD CONSTRAINT v2_projects_pkey PRIMARY KEY (id);
ALTER TABLE v2_projects ADD CONSTRAINT v2_projects_position_unique UNIQUE ("position") DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE v2_project_versions ADD CONSTRAINT v2_project_versions_pkey PRIMARY KEY (id);
ALTER TABLE v2_project_slugs ADD CONSTRAINT v2_project_slugs_pkey PRIMARY KEY (slug);
ALTER TABLE v2_project_texts ADD CONSTRAINT v2_project_texts_pkey PRIMARY KEY (id);
ALTER TABLE v2_project_texts ADD CONSTRAINT v2_project_texts_unique UNIQUE (version_id, language);
ALTER TABLE v2_media_objects ADD CONSTRAINT v2_media_objects_pkey PRIMARY KEY (id);
ALTER TABLE v2_media_objects ADD CONSTRAINT v2_media_objects_public_token_key UNIQUE (public_token);
ALTER TABLE v2_media_objects ADD CONSTRAINT v2_media_objects_storage_key_key UNIQUE (storage_key);
ALTER TABLE v2_project_images ADD CONSTRAINT v2_project_images_pkey PRIMARY KEY (id);
ALTER TABLE v2_project_images ADD CONSTRAINT v2_project_images_unique UNIQUE (version_id, media_object_id, role);
ALTER TABLE v2_project_image_texts ADD CONSTRAINT v2_project_image_texts_pkey PRIMARY KEY (id);
ALTER TABLE v2_project_image_texts ADD CONSTRAINT v2_project_image_texts_unique UNIQUE (project_image_id, language);
ALTER TABLE v2_project_links ADD CONSTRAINT v2_project_links_pkey PRIMARY KEY (id);
ALTER TABLE v2_project_link_texts ADD CONSTRAINT v2_project_link_texts_pkey PRIMARY KEY (id);
ALTER TABLE v2_project_link_texts ADD CONSTRAINT v2_project_link_texts_unique UNIQUE (project_link_id, language);
ALTER TABLE v2_project_tech ADD CONSTRAINT v2_project_tech_pkey PRIMARY KEY (id);
ALTER TABLE v2_project_tech ADD CONSTRAINT v2_project_tech_unique UNIQUE (version_id, name);

-- Value rules.
ALTER TABLE v2_projects ADD CONSTRAINT v2_projects_lifecycle_check CHECK ((lifecycle = ANY (ARRAY['active'::text, 'archived'::text])));
ALTER TABLE v2_project_versions ADD CONSTRAINT v2_project_versions_kind_check CHECK ((kind = ANY (ARRAY['draft'::text, 'published'::text])));
ALTER TABLE v2_project_versions ADD CONSTRAINT v2_project_versions_slug_check CHECK (((slug = ''::text) OR (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)));
ALTER TABLE v2_project_versions ADD CONSTRAINT v2_project_versions_status_check CHECK ((work_status = ANY (ARRAY['in_progress'::text, 'completed'::text])));
ALTER TABLE v2_project_versions ADD CONSTRAINT v2_project_versions_type_check CHECK ((type = ANY (ARRAY['demo'::text, 'personal'::text, 'client'::text])));
ALTER TABLE v2_project_texts ADD CONSTRAINT v2_project_texts_language_check CHECK ((language = ANY (ARRAY['de'::text, 'en'::text, 'ar'::text])));
ALTER TABLE v2_media_objects ADD CONSTRAINT v2_media_objects_size_check CHECK (((byte_size > 0) AND (width > 0) AND (height > 0)));
ALTER TABLE v2_project_images ADD CONSTRAINT v2_project_images_role_check CHECK ((role = ANY (ARRAY['cover'::text, 'gallery'::text, 'inline'::text])));
ALTER TABLE v2_project_image_texts ADD CONSTRAINT v2_project_image_texts_language_check CHECK ((language = ANY (ARRAY['de'::text, 'en'::text, 'ar'::text])));
ALTER TABLE v2_project_links ADD CONSTRAINT v2_project_links_kind_check CHECK ((kind = ANY (ARRAY['website'::text, 'source'::text, 'other'::text])));
ALTER TABLE v2_project_link_texts ADD CONSTRAINT v2_project_link_texts_language_check CHECK ((language = ANY (ARRAY['de'::text, 'en'::text, 'ar'::text])));

-- References. Two of these point at each other, which is why they come last.
ALTER TABLE v2_projects ADD CONSTRAINT v2_projects_draft_fk FOREIGN KEY (draft_version_id) REFERENCES v2_project_versions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE v2_projects ADD CONSTRAINT v2_projects_published_fk FOREIGN KEY (published_version_id) REFERENCES v2_project_versions(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE v2_project_versions ADD CONSTRAINT v2_project_versions_project_id_fkey FOREIGN KEY (project_id) REFERENCES v2_projects(id) ON DELETE CASCADE;
ALTER TABLE v2_project_slugs ADD CONSTRAINT v2_project_slugs_project_id_fkey FOREIGN KEY (project_id) REFERENCES v2_projects(id) ON DELETE CASCADE;
ALTER TABLE v2_project_texts ADD CONSTRAINT v2_project_texts_version_id_fkey FOREIGN KEY (version_id) REFERENCES v2_project_versions(id) ON DELETE CASCADE;
ALTER TABLE v2_media_objects ADD CONSTRAINT v2_media_objects_project_id_fkey FOREIGN KEY (project_id) REFERENCES v2_projects(id) ON DELETE CASCADE;
ALTER TABLE v2_project_images ADD CONSTRAINT v2_project_images_media_object_id_fkey FOREIGN KEY (media_object_id) REFERENCES v2_media_objects(id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE v2_project_images ADD CONSTRAINT v2_project_images_version_id_fkey FOREIGN KEY (version_id) REFERENCES v2_project_versions(id) ON DELETE CASCADE;
ALTER TABLE v2_project_image_texts ADD CONSTRAINT v2_project_image_texts_project_image_id_fkey FOREIGN KEY (project_image_id) REFERENCES v2_project_images(id) ON DELETE CASCADE;
ALTER TABLE v2_project_links ADD CONSTRAINT v2_project_links_version_id_fkey FOREIGN KEY (version_id) REFERENCES v2_project_versions(id) ON DELETE CASCADE;
ALTER TABLE v2_project_link_texts ADD CONSTRAINT v2_project_link_texts_project_link_id_fkey FOREIGN KEY (project_link_id) REFERENCES v2_project_links(id) ON DELETE CASCADE;
ALTER TABLE v2_project_tech ADD CONSTRAINT v2_project_tech_version_id_fkey FOREIGN KEY (version_id) REFERENCES v2_project_versions(id) ON DELETE CASCADE;

-- Indexes that are not constraints.
CREATE INDEX v2_projects_public_order_idx ON v2_projects USING btree ("position") WHERE ((lifecycle = 'active'::text) AND (published_version_id IS NOT NULL));
CREATE UNIQUE INDEX v2_project_versions_one_per_kind ON v2_project_versions USING btree (project_id, kind);
CREATE UNIQUE INDEX v2_project_slugs_current_idx ON v2_project_slugs USING btree (project_id) WHERE is_current;
CREATE INDEX v2_media_objects_project_idx ON v2_media_objects USING btree (project_id);
CREATE UNIQUE INDEX v2_project_images_one_cover ON v2_project_images USING btree (version_id) WHERE (role = 'cover'::text);
CREATE INDEX v2_project_images_order_idx ON v2_project_images USING btree (version_id, role, "position");
CREATE INDEX v2_project_links_order_idx ON v2_project_links USING btree (version_id, "position");
CREATE UNIQUE INDEX v2_project_links_single_idx ON v2_project_links USING btree (version_id, kind) WHERE (kind <> 'other'::text);
