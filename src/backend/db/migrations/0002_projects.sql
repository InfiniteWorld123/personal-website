-- Portfolio case studies. The public site read these from `content/site.ts`
-- and the three language files; from here on the database owns them.

CREATE TABLE projects (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'building',
    website_url text,
    source_url text,
    is_published boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT projects_status_check CHECK ("status" IN ('live', 'building')),
    -- The slug is part of a public URL, so the shape is enforced here and not
    -- only in the admin form.
    CONSTRAINT projects_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

-- The public listing is always "published, in the owner's order".
CREATE INDEX projects_published_order_idx ON projects (is_published, sort_order, created_at);

-- One row per language. A project is publishable only when all three exist;
-- that rule lives in the service, because a draft has to be saveable with one.
CREATE TABLE project_translations (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects ("id") ON DELETE CASCADE,
    "language" text NOT NULL,
    "name" text NOT NULL,
    kind text NOT NULL,
    summary text NOT NULL,
    problem text NOT NULL,
    approach text NOT NULL,
    shows text NOT NULL,
    features text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT project_translations_language_check CHECK ("language" IN ('de', 'en', 'ar')),
    CONSTRAINT project_translations_unique UNIQUE (project_id, "language")
);

CREATE TABLE project_images (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects ("id") ON DELETE CASCADE,
    -- A public path today, an R2 object key once uploads land.
    src text NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    is_cover boolean NOT NULL DEFAULT false,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT project_images_width_check CHECK (width > 0),
    CONSTRAINT project_images_height_check CHECK (height > 0)
);

CREATE INDEX project_images_order_idx ON project_images (project_id, sort_order);

-- A project has at most one cover image, enforced by the database.
CREATE UNIQUE INDEX project_images_single_cover_idx ON project_images (project_id)
WHERE
    is_cover;

-- Alternative text carries the proof for anyone who cannot see the image, so
-- it is translated like any other copy.
CREATE TABLE project_image_translations (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    project_image_id uuid NOT NULL REFERENCES project_images ("id") ON DELETE CASCADE,
    "language" text NOT NULL,
    alt text NOT NULL,
    CONSTRAINT project_image_translations_language_check CHECK ("language" IN ('de', 'en', 'ar')),
    CONSTRAINT project_image_translations_unique UNIQUE (project_image_id, "language")
);

CREATE TABLE project_tech (
    id uuid NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects ("id") ON DELETE CASCADE,
    "name" text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    CONSTRAINT project_tech_unique UNIQUE (project_id, "name")
);

CREATE INDEX project_tech_order_idx ON project_tech (project_id, sort_order);
