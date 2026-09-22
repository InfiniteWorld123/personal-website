import { useState } from 'react'
import { FolderPlus, Pencil, Trash2, Upload } from 'lucide-react'
import type { MediaAsset } from '#/backend2/contracts/media.contract'
import {
  describeSizeLimit,
  FileNameSchema,
  FolderNameSchema,
} from '#/backend2/contracts/media.contract'
import type { MediaFolderNode } from '#/backend2/contracts/media.contract'
import { MediaBrowser, useBrowserState } from '#/frontend/features/media/MediaBrowser'
import {
  useCreateFolder,
  useDeleteFolder,
  useFolders,
  useRefreshMedia,
  useRenameFolder,
  useUpdateFile,
} from '#/frontend/features/media/queries'
import { deleteFile } from '#/frontend/features/media/api'
import { UploadButton, UploadList, useUploads } from '#/frontend/features/media/uploads'
import { DashboardPage, PageHead, Panel } from '#/frontend/dashboard/primitives'
import { MediaDetails } from './MediaDetails'
import { DeleteDialog, DeleteFolderDialog, MoveDialog, NameDialog } from './MediaDialogs'

/**
 * The shared vault, at `/dashboard/media`.
 *
 * One private library for every module. What the screen is arranged around is
 * the fact that matters most here and nowhere else: whether a file is used.
 * It decides whether the delete button works and whether a visitor can load
 * the bytes, so it is on every tile rather than buried in the panel.
 *
 * Owner-only, like the rest of `/dashboard` — the folder tree, the filenames,
 * the original metadata and every unselected file are all behind the V2 owner
 * session, and none of it becomes public because one image was published.
 */

type Dialog =
  | { kind: 'new-folder' }
  | { kind: 'rename'; asset: MediaAsset }
  | { kind: 'move'; asset: MediaAsset }
  | { kind: 'delete'; asset: MediaAsset }
  | { kind: 'rename-folder'; id: string; name: string }
  | { kind: 'delete-folder'; id: string; name: string }
  | null

export function MediaPage() {
  const browser = useBrowserState()
  const folders = useFolders()
  const [selected, setSelected] = useState<MediaAsset | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)

  const createFolder = useCreateFolder()
  const updateFile = useUpdateFile()
  const renameFolder = useRenameFolder()
  const removeFolder = useDeleteFolder()
  const refreshMedia = useRefreshMedia()

  const folderChoice = browser.state.folder
  const folderId = folderChoice === 'all' || folderChoice === 'root' ? null : folderChoice

  const nameOfFolder = (nodes: MediaFolderNode[], id: string): string | null => {
    for (const node of nodes) {
      if (node.id === id) return node.name

      const inChild = nameOfFolder(node.children, id)

      if (inChild) return inChild
    }

    return null
  }

  const folderName = folderId
    ? (nameOfFolder(folders.data?.tree ?? [], folderId) ?? 'this folder')
    : 'the library root'

  const uploads = useUploads({
    folderId,
    folderName,
    onUploaded: (asset) => {
      setSelected(asset)
      // Without this the file lands on the server and not in the grid: the
      // upload goes straight to the API rather than through a mutation, so
      // nothing else tells the cached page or the folder counts that the
      // library changed.
      refreshMedia()
    },
  })

  const openUpload = () => {
    document.querySelector<HTMLElement>('[data-media-upload] input[type="file"]')?.click()
  }

  return (
    <DashboardPage className="gap-5">
      <PageHead
        eyebrow="Shared library"
        title="Media"
        description="Every image, video and document the site uses, in one place. Projects, Blog and anything later pick from here — a file only ever needs uploading once, and nothing deletes it but you."
        actions={
          <>
            <span data-media-upload>
              <UploadButton onFiles={uploads.add} className="dash-btn dash-btn-quiet">
                <Upload className="size-4" aria-hidden />
                Upload
              </UploadButton>
            </span>
            <button
              type="button"
              className="dash-btn dash-btn-primary"
              onClick={() => setDialog({ kind: 'new-folder' })}
            >
              <FolderPlus className="size-4" aria-hidden />
              New folder
            </button>
          </>
        }
      />

      <Panel className="min-h-[560px] overflow-hidden">
        <UploadList
          items={uploads.items}
          onRemove={uploads.remove}
          onClear={uploads.clearFinished}
        />

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <MediaBrowser
            {...browser}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onRequestUpload={openUpload}
            folderActions={
              folderId ? (
                <>
                  <button
                    type="button"
                    className="dash-btn dash-btn-quiet h-8 px-2 text-xs"
                    onClick={() => setDialog({ kind: 'rename-folder', id: folderId, name: folderName })}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                    Rename folder
                  </button>
                  <button
                    type="button"
                    className="dash-btn dash-btn-ghost h-8 px-2 text-xs"
                    onClick={() => setDialog({ kind: 'delete-folder', id: folderId, name: folderName })}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    <span className="sr-only">Delete the folder {folderName}</span>
                  </button>
                </>
              ) : null
            }
          />

          <aside
            aria-label="File details"
            className="w-full shrink-0 border-t border-[var(--dash-line)] lg:w-[284px] lg:border-t-0 lg:border-s"
          >
            <MediaDetails
              asset={selected}
              onRename={() => selected && setDialog({ kind: 'rename', asset: selected })}
              onMove={() => selected && setDialog({ kind: 'move', asset: selected })}
              onDelete={() => selected && setDialog({ kind: 'delete', asset: selected })}
            />
          </aside>
        </div>
      </Panel>

      <p className="text-[12px] text-[var(--dash-quiet)]">
        {describeSizeLimit('image')} · {describeSizeLimit('document')} ·{' '}
        {describeSizeLimit('video')}. Images, video, PDF, Office and OpenDocument files, RTF, text
        and ZIP are accepted; every file is checked against its actual contents, not its name.
      </p>

      {dialog?.kind === 'new-folder' ? (
        <NameDialog
          title="New folder"
          label="Folder name"
          hint={
            folderId ? `It will sit inside ${folderName}.` : 'It will sit at the library root.'
          }
          initial=""
          submitLabel="Create folder"
          schema={FolderNameSchema}
          onSubmit={(name) => createFolder.mutateAsync({ name, parentId: folderId })}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === 'rename' ? (
        <NameDialog
          title="Rename file"
          label="File name"
          hint="The stored copy does not change, and nothing using this file breaks."
          initial={dialog.asset.displayName}
          submitLabel="Save name"
          schema={FileNameSchema}
          onSubmit={async (displayName) => {
            const updated = await updateFile.mutateAsync({ id: dialog.asset.id, displayName })

            setSelected(updated)
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === 'move' ? (
        <MoveDialog
          asset={dialog.asset}
          tree={folders.data?.tree ?? []}
          onSubmit={async (target) => {
            const updated = await updateFile.mutateAsync({ id: dialog.asset.id, folderId: target })

            setSelected(updated)
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === 'rename-folder' ? (
        <NameDialog
          title="Rename folder"
          label="Folder name"
          hint="Nothing inside moves, and nothing using those files breaks."
          initial={dialog.name}
          submitLabel="Save name"
          schema={FolderNameSchema}
          onSubmit={(name) => renameFolder.mutateAsync({ id: dialog.id, name })}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === 'delete-folder' ? (
        <DeleteFolderDialog
          name={dialog.name}
          onConfirm={async () => {
            await removeFolder.mutateAsync(dialog.id)
            // The folder that was being browsed is gone; go back to everything.
            browser.update({ folder: 'all' })
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {dialog?.kind === 'delete' ? (
        <DeleteDialog
          asset={dialog.asset}
          onConfirm={async () => {
            /*
             * Called directly rather than through a mutation so a refusal
             * reaches the dialog with its `details` intact — that list of uses
             * is what the dialog turns into its explanation. A refusal throws
             * here, so nothing below it runs and the file stays selected.
             */
            const result = await deleteFile(dialog.asset.id)

            setSelected(null)
            refreshMedia()

            return result
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </DashboardPage>
  )
}
