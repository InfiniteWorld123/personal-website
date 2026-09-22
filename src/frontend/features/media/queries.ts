import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaAsset, MediaReference } from '#/backend2/contracts/media.contract'
import type { Page } from '#/backend2/contracts/pagination.contract'
import {
  createFolder,
  deleteFile,
  deleteFolder,
  listFiles,
  listFolders,
  listReferences,
  updateFile,
  updateFolder,
  type FolderTree,
  type LibraryQuery,
} from './api'

/**
 * What the library reads, and what has to be re-read after each write.
 *
 * One prefix for the whole module, because almost every write changes more
 * than the list it was made from: moving a file changes two folders' counts,
 * deleting one changes the total, and a fresh upload changes whichever page
 * the owner is looking at. A narrower invalidation would leave a count on
 * screen that is no longer true — and in a vault, a wrong "used in 2 places"
 * is the number that decides whether a delete button is enabled.
 */
export const mediaKeys = {
  all: ['backend2', 'media'] as const,
  files: (query: LibraryQuery) => [...mediaKeys.all, 'files', query] as const,
  folders: () => [...mediaKeys.all, 'folders'] as const,
  references: (id: string, page: number) =>
    [...mediaKeys.all, 'references', id, page] as const,
}

export const useLibrary = (query: LibraryQuery) =>
  useQuery<Page<MediaAsset>>({
    queryKey: mediaKeys.files(query),
    queryFn: () => listFiles(query),
    // Keeps the previous page on screen while the next one loads, so paging
    // does not blank the grid and jump the scroll position.
    placeholderData: (previous) => previous,
  })

export const useFolders = () =>
  useQuery<FolderTree>({ queryKey: mediaKeys.folders(), queryFn: listFolders })

/**
 * The uses of one file. Only fetched when a panel is actually open — the list
 * already knows how many there are, and that is all a tile shows.
 */
export const useReferences = (id: string | null, page: number, enabled: boolean) =>
  useQuery<Page<MediaReference>>({
    queryKey: mediaKeys.references(id ?? 'none', page),
    queryFn: () => listReferences(id!, page),
    enabled: enabled && id !== null,
    placeholderData: (previous) => previous,
  })

export const useRefreshMedia = () => {
  const client = useQueryClient()

  return () => client.invalidateQueries({ queryKey: mediaKeys.all })
}

/* --------------------------------------------------------------- mutations */

export const useUpdateFile = () => {
  const refresh = useRefreshMedia()

  return useMutation({
    mutationFn: (input: { id: string; displayName?: string; folderId?: string | null }) =>
      updateFile(input.id, { displayName: input.displayName, folderId: input.folderId }),
    onSuccess: refresh,
  })
}

export const useDeleteFile = () => {
  const refresh = useRefreshMedia()

  return useMutation({
    mutationFn: (id: string) => deleteFile(id),
    onSuccess: refresh,
  })
}

export const useCreateFolder = () => {
  const refresh = useRefreshMedia()

  return useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) => createFolder(input),
    onSuccess: refresh,
  })
}

export const useRenameFolder = () => {
  const refresh = useRefreshMedia()

  return useMutation({
    mutationFn: (input: { id: string; name?: string; parentId?: string | null }) =>
      updateFolder(input.id, { name: input.name, parentId: input.parentId }),
    onSuccess: refresh,
  })
}

export const useDeleteFolder = () => {
  const refresh = useRefreshMedia()

  return useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: refresh,
  })
}
