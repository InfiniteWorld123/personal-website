import * as v from 'valibot'

/**
 * The shared Media contract, imported by the server and by every module's
 * picker. See `docs/v2/media.md`.
 *
 * Pure: valibot and plain TypeScript, nothing server-only. The rules here are
 * the ones the browser shows the owner *before* a 100 MB upload starts; the
 * server enforces every one of them again against the actual bytes.
 */

/* ------------------------------------------------------------------ families */

/** The three file families `docs/v2/media.md` accepts initially. */
export const MEDIA_KINDS = ['image', 'video', 'document'] as const

export type MediaKind = (typeof MEDIA_KINDS)[number]

/**
 * The allowlist, by detected type.
 *
 * `docs/v2/media.md` opened with images, video and PDF, and said the rest
 * "can be considered later; do not silently accept every file type now". The
 * owner considered it on 22 Sep 2026 and asked for work documents. So the list
 * grew — and the sentence that governs it did not: **every type here is one
 * `media/probe.ts` can recognise from the file's own bytes.** A format nobody
 * can verify is still a format this module refuses, which is what stops an
 * executable arriving as `holiday.jpg`.
 *
 * SVG is here by an explicit decision, against the specification's default.
 * It is the right format for a logo and it is also a script container, so it
 * is accepted only under the isolation in `media.http.ts`: every file response
 * carries `Content-Security-Policy: default-src 'none'; sandbox`, and a
 * sandbox without `allow-scripts` means nothing runs even when the URL is
 * opened directly. Inside an `<img>` — how a cover image is drawn — scripts
 * never run at all.
 *
 * Still absent, and staying absent: HTML of any description. There is no way
 * to serve it that is worth the sentence explaining the risk.
 */
export const ACCEPTED_TYPES = {
  image: [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/svg+xml',
  ],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  document: [
    'application/pdf',
    // Modern Office. ZIP containers, told apart by what is inside them.
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Legacy Office. One shared OLE2 signature, three applications.
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint',
    // OpenDocument, which writes its own media type into the archive.
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/rtf',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/zip',
  ],
} as const satisfies Record<MediaKind, readonly string[]>

export const ACCEPTED_CONTENT_TYPES: readonly string[] = [
  ...ACCEPTED_TYPES.image,
  ...ACCEPTED_TYPES.video,
  ...ACCEPTED_TYPES.document,
]

/**
 * The short badge the library puts on a tile. `kind` is the coarse family the
 * database stores and the filters use; this is what the owner actually calls
 * the file.
 */
export const TYPE_LABELS: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/avif': 'AVIF',
  'image/svg+xml': 'SVG',
  'video/mp4': 'MP4',
  'video/quicktime': 'MOV',
  'video/webm': 'WebM',
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint',
  'application/msword': 'Word',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.ms-powerpoint': 'PowerPoint',
  'application/vnd.oasis.opendocument.text': 'ODT',
  'application/vnd.oasis.opendocument.spreadsheet': 'ODS',
  'application/vnd.oasis.opendocument.presentation': 'ODP',
  'application/rtf': 'RTF',
  'text/plain': 'Text',
  'text/markdown': 'Markdown',
  'text/csv': 'CSV',
  'application/zip': 'ZIP',
}

export const labelForType = (contentType: string): string =>
  TYPE_LABELS[contentType] ?? contentType.split('/').pop()?.toUpperCase() ?? 'File'

/** What an `<input type="file">` should offer. Convenience, never a boundary. */
export const FILE_INPUT_ACCEPT = ACCEPTED_CONTENT_TYPES.join(',')

/* -------------------------------------------------------------------- limits */

/**
 * Per-family ceilings, in bytes.
 *
 * The video number is not a preference; it is the platform. Cloudflare caps
 * the *request body* at 100 MB on the Free and Pro plans (200 MB on Business),
 * so a file larger than that cannot reach a Worker in one request whatever
 * this module would like. Raising it means building chunked upload on top of
 * R2 multipart — which `uploadKind`/`MediaAssetSchema` below are shaped to
 * accommodate without changing the library contract.
 *
 * Verified 22 Sep 2026 against
 * https://developers.cloudflare.com/workers/platform/limits/.
 */
export const MAX_BYTES: Record<MediaKind, number> = {
  image: 25 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  video: 100 * 1024 * 1024,
}

/** The largest any single upload may be, whatever its family. */
export const MAX_UPLOAD_BYTES = Math.max(...Object.values(MAX_BYTES))

/** How many bytes the server reads before it decides what a file actually is. */
export const PROBE_BYTES = 64 * 1024

export const MEDIA_LIMITS = {
  filename: 200,
  folderName: 120,
  /** Root is depth 0, so this permits `Projects / 2026 / Q1 / …` eight deep. */
  maxFolderDepth: 7,
  /** A guard on the folder tree response, which is navigation rather than a list. */
  maxFolders: 500,
  searchQuery: 120,
} as const

/* -------------------------------------------------------------------- errors */

/**
 * The failures this module reports on purpose. The Dashboard switches on these
 * rather than on message text.
 */
export const MEDIA_ERROR_CODES = [
  'UNSUPPORTED_FILE_TYPE',
  'FILE_TOO_LARGE',
  'UPLOAD_FAILED',
  'STORAGE_UNAVAILABLE',
  'DELETE_BLOCKED_BY_REFERENCES',
  'FOLDER_NOT_EMPTY',
  'FOLDER_CYCLE',
  'FOLDER_DEPTH_EXCEEDED',
  'NAME_TAKEN',
  'NOT_FOUND',
] as const

export type MediaErrorCode = (typeof MEDIA_ERROR_CODES)[number]

/* --------------------------------------------------------------------- shapes */

/** Where a file is used, as the refusal dialog and the detail panel show it. */
export type MediaReference = {
  id: string
  module: 'projects' | 'blog' | 'services' | 'invoices' | 'content' | 'inbox'
  /** `published` is the only scope a visitor can reach. */
  scope: 'draft' | 'scheduled' | 'published' | 'record'
  ownerType: string
  ownerId: string
  usage: 'cover' | 'gallery' | 'inline' | 'attachment' | 'other'
  position: number
  /** Plain text written by the consuming module. Render it as text. */
  label: string
  createdAt: string
}

/**
 * One file, as the owner sees it.
 *
 * `storageKey` is absent by construction: the object key never leaves the
 * server, and `originalName` is private metadata the library shows only to the
 * owner.
 */
export type MediaAsset = {
  id: string
  folderId: string | null
  kind: MediaKind
  contentType: string
  displayName: string
  originalName: string
  byteSize: number
  checksum: string
  width: number | null
  height: number | null
  createdAt: string
  updatedAt: string
  /** How many uses this file has, across every module and scope. */
  referenceCount: number
  /** True when at least one live published snapshot uses it. */
  isPublished: boolean
}

export type MediaFolder = {
  id: string
  parentId: string | null
  name: string
  depth: number
  createdAt: string
  updatedAt: string
}

export type MediaFolderNode = MediaFolder & {
  children: MediaFolderNode[]
  /** Files directly in this folder, not counting its subfolders. */
  fileCount: number
}

/* -------------------------------------------------------------------- schemas */

const Uuid = v.pipe(v.string(), v.uuid('That is not a valid id'))

/** `null`/absent means the library root, which is a real place, not "unset". */
export const FolderIdSchema = v.nullable(Uuid)

export const FolderNameSchema = v.pipe(
  v.string('Give the folder a name'),
  v.trim(),
  v.minLength(1, 'Give the folder a name'),
  v.maxLength(MEDIA_LIMITS.folderName, `Keep it under ${MEDIA_LIMITS.folderName} characters`),
  // A folder name is a label, never a path. Refusing the separators here means
  // no later code has to wonder whether `../` arrived in one.
  v.regex(/^[^/\\]+$/u, 'A folder name cannot contain a slash'),
  v.check((name) => name !== '.' && name !== '..', 'Choose a different name'),
)

export const FileNameSchema = v.pipe(
  v.string('Give the file a name'),
  v.trim(),
  v.minLength(1, 'Give the file a name'),
  v.maxLength(MEDIA_LIMITS.filename, `Keep it under ${MEDIA_LIMITS.filename} characters`),
  v.regex(/^[^/\\]+$/u, 'A file name cannot contain a slash'),
  v.check((name) => name !== '.' && name !== '..', 'Choose a different name'),
)

export const CreateFolderSchema = v.object({
  name: FolderNameSchema,
  parentId: v.optional(FolderIdSchema, null),
})

/** Rename, move, or both. An absent key is "leave it alone". */
export const UpdateFolderSchema = v.pipe(
  v.object({
    name: v.optional(FolderNameSchema),
    parentId: v.optional(FolderIdSchema),
  }),
  v.check(
    (input) => input.name !== undefined || input.parentId !== undefined,
    'Nothing to change',
  ),
)

export const UpdateAssetSchema = v.pipe(
  v.object({
    displayName: v.optional(FileNameSchema),
    folderId: v.optional(FolderIdSchema),
  }),
  v.check(
    (input) => input.displayName !== undefined || input.folderId !== undefined,
    'Nothing to change',
  ),
)

/**
 * The library filter.
 *
 * `folderId` here is three-valued on purpose: absent searches the whole
 * library, `"root"` means files with no folder, and a uuid means that folder.
 * Without the distinction, "show me the root" and "show me everything" would
 * be the same request.
 */
export const MediaListQuerySchema = v.object({
  folderId: v.optional(v.union([v.literal('root'), Uuid])),
  kind: v.optional(v.picklist(MEDIA_KINDS)),
  /** `used` and `unused` are what make an orphan findable before deletion. */
  usage: v.optional(v.picklist(['used', 'unused', 'published'])),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(MEDIA_LIMITS.searchQuery))),
  sort: v.optional(v.picklist(['newest', 'oldest', 'name', 'size']), 'newest'),
})

export type MediaListQuery = v.InferOutput<typeof MediaListQuerySchema>

/* ------------------------------------------------------------------ helpers */

export const kindOfContentType = (contentType: string): MediaKind | null => {
  for (const kind of MEDIA_KINDS) {
    if ((ACCEPTED_TYPES[kind] as readonly string[]).includes(contentType)) return kind
  }

  return null
}

/** The same sentence the server sends back, available before the upload starts. */
export const describeSizeLimit = (kind: MediaKind): string =>
  `${kind === 'document' ? 'A PDF' : `A ${kind}`} may be up to ${Math.round(
    MAX_BYTES[kind] / (1024 * 1024),
  )} MB`
