import type { MediaFolderNode } from '../../contracts/media.contract'
import { MEDIA_LIMITS } from '../../contracts/media.contract'
import { withTransaction } from '../../db/client'
import {
  folderCycle,
  folderDepthExceeded,
  folderNotEmpty,
  nameTaken,
  notFound,
} from '../../http/error'
import { toFolder } from './media.mapper'
import * as repo from './media.repo'

/**
 * The folder tree.
 *
 * Folders are "organizational choices, not permission boundaries or separate
 * storage systems" (`docs/v2/media.md`), so nothing here decides who may see a
 * file — that is the owner guard's job, once, for the whole module. What this
 * file does decide is the three structural rules the specification names:
 * a folder can be moved only if that cannot create a cycle, deleting one
 * requires it to be empty, and a file at the library root is allowed.
 */

/** Confirms a parent exists and answers how deep a child of it would sit. */
const depthUnder = async (parentId: string | null): Promise<number> => {
  if (parentId === null) return 0

  const parent = await repo.findFolder(parentId)

  if (!parent) throw notFound('That folder does not exist')

  const depth = parent.depth + 1

  if (depth > MEDIA_LIMITS.maxFolderDepth) {
    throw folderDepthExceeded(
      `Folders can be nested ${MEDIA_LIMITS.maxFolderDepth + 1} levels deep`,
    )
  }

  return depth
}

export const createFolder = async (input: { name: string; parentId: string | null }) =>
  withTransaction(async () => {
    const depth = await depthUnder(input.parentId)

    if (await repo.countFoldersInParent({ parentId: input.parentId, name: input.name })) {
      throw nameTaken(`There is already a folder called “${input.name}” here`)
    }

    return toFolder(await repo.insertFolder({ ...input, depth }))
  })

export const renameOrMoveFolder = async (input: {
  id: string
  name?: string
  parentId?: string | null
}) =>
  withTransaction(async () => {
    const folder = await repo.findFolder(input.id)

    if (!folder) throw notFound('That folder does not exist')

    const parentId = input.parentId === undefined ? folder.parent_id : input.parentId
    const name = input.name ?? folder.name
    const moving = input.parentId !== undefined && input.parentId !== folder.parent_id

    if (moving && parentId !== null) {
      /*
       * The cycle check, stated the way the failure happens: a folder may not
       * be moved into its own descendant, because the subtree would then have
       * no path to the root and would vanish from the tree while still
       * existing in the table.
       */
      const ancestors = await repo.ancestorIds(parentId)

      if (parentId === folder.id || ancestors.includes(folder.id)) {
        throw folderCycle('A folder cannot be moved inside itself')
      }
    }

    if (
      await repo.countFoldersInParent({ parentId, name, excludeId: folder.id })
    ) {
      throw nameTaken(`There is already a folder called “${name}” here`)
    }

    const newDepth = moving ? await depthUnder(parentId) : folder.depth

    /*
     * Moving a folder moves everything under it, so the ceiling applies to the
     * deepest leaf rather than to the folder being dragged. Checked before the
     * write: the CHECK constraint would catch it too, but as a 500 rather than
     * as a sentence the owner can act on.
     */
    const descendants = await repo.subtree(folder.id)

    if (moving) {
      const deepest = Math.max(...descendants.map((row) => row.relative_depth))

      if (newDepth + deepest > MEDIA_LIMITS.maxFolderDepth) {
        throw folderDepthExceeded(
          `Folders can be nested ${MEDIA_LIMITS.maxFolderDepth + 1} levels deep`,
        )
      }
    }

    const updated = await repo.updateFolderRow({
      id: folder.id,
      name: input.name,
      parentId: input.parentId,
      depth: newDepth,
    })

    if (moving) {
      for (const row of descendants) {
        if (row.id === folder.id) continue

        await repo.setFolderDepth(row.id, newDepth + row.relative_depth)
      }
    }

    return toFolder(updated!)
  })

/**
 * Deleting a folder never deletes a file.
 *
 * "deleting a folder requires it to be empty … Deleting an empty folder never
 * deletes files implicitly." The `ON DELETE RESTRICT` foreign keys would refuse
 * this anyway; the point of checking first is that the owner gets a count and a
 * reason instead of a constraint violation.
 */
export const deleteFolder = async (id: string): Promise<void> =>
  withTransaction(async () => {
    const folder = await repo.findFolder(id)

    if (!folder) throw notFound('That folder does not exist')

    const [children, files] = await Promise.all([
      repo.folderChildCount(id),
      repo.folderFileCount(id),
    ])

    if (children > 0 || files > 0) {
      throw folderNotEmpty(
        `That folder still holds ${describeContents(files, children)}. Move or delete them first.`,
        { files, folders: children },
      )
    }

    await repo.deleteFolderRow(id)
  })

const describeContents = (files: number, folders: number): string => {
  const parts: string[] = []

  if (files > 0) parts.push(`${files} file${files === 1 ? '' : 's'}`)
  if (folders > 0) parts.push(`${folders} folder${folders === 1 ? '' : 's'}`)

  return parts.join(' and ')
}

/**
 * The tree, built once from one flat read.
 *
 * Rows arrive ordered by depth, so every parent is placed before any of its
 * children and a single pass is enough. A row whose parent is missing from the
 * page — only possible when the cap below truncated the read — is attached to
 * the root rather than dropped, so nothing disappears silently.
 */
export const folderTree = async (): Promise<{
  tree: MediaFolderNode[]
  total: number
  truncated: boolean
}> => {
  const rows = await repo.listFolders()
  const truncated = rows.length > MEDIA_LIMITS.maxFolders
  const visible = truncated ? rows.slice(0, MEDIA_LIMITS.maxFolders) : rows

  const nodes = new Map<string, MediaFolderNode>()
  const roots: MediaFolderNode[] = []

  for (const row of visible) {
    nodes.set(row.id, { ...toFolder(row), children: [], fileCount: row.file_count })
  }

  for (const row of visible) {
    const node = nodes.get(row.id)!
    const parent = row.parent_id ? nodes.get(row.parent_id) : undefined

    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  const byName = (a: MediaFolderNode, b: MediaFolderNode) =>
    a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id)

  const sort = (list: MediaFolderNode[]): void => {
    list.sort(byName)

    for (const node of list) sort(node.children)
  }

  sort(roots)

  return { tree: roots, total: visible.length, truncated }
}

/** Confirms a folder id before a file is put in it. `null` — the root — always exists. */
export const assertFolderExists = async (folderId: string | null): Promise<void> => {
  if (folderId === null) return
  if (!(await repo.findFolder(folderId))) throw notFound('That folder does not exist')
}
