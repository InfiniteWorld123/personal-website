// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { MediaAsset, MediaFolderNode } from '#/backend2/contracts/media.contract'

/**
 * The Media screens, against a faked API.
 *
 * The backend suite proves the rules; this proves the screen tells the truth
 * about them — that a file something uses cannot be deleted from here, that
 * the refusal names where it is used, that an unsupported file is refused with
 * its own sentence rather than a shrug, and that the picker and the library
 * are the same browser.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: '/dashboard/media' } }),
}))

/* The API module is the seam: every screen reaches the server through it. */
const api = {
  listFiles: vi.fn(),
  readFile: vi.fn(),
  updateFile: vi.fn(),
  deleteFile: vi.fn(),
  listReferences: vi.fn(),
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
  uploadFile: vi.fn(),
  fileContentUrl: (id: string) => `/api/v2/owner/media/files/${id}/content`,
}

vi.mock('#/frontend/features/media/api', () => api)

const { MediaPage } = await import('#/frontend/pages/dashboard/media/MediaPage')
const { MediaPicker } = await import('#/frontend/features/media/MediaPicker')
const { dashboardNavigation } = await import('#/frontend/dashboard/dashboard-navigation')
const { ApiRequestError } = await import('#/frontend/api/response')

/* ---------------------------------------------------------------- fixtures */

const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  id: 'a1',
  folderId: null,
  kind: 'image',
  contentType: 'image/png',
  displayName: 'tea-shop-cover.png',
  originalName: 'Tea Shop Cover.PNG',
  byteSize: 1_887_436,
  checksum: 'abc123',
  width: 2400,
  height: 1600,
  createdAt: '2026-09-12T10:00:00.000Z',
  updatedAt: '2026-09-12T10:00:00.000Z',
  referenceCount: 0,
  isPublished: false,
  ...over,
})

const folder = (over: Partial<MediaFolderNode> = {}): MediaFolderNode => ({
  id: 'f-projects',
  parentId: null,
  name: 'Projects',
  depth: 0,
  createdAt: '2026-09-01T10:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  children: [],
  fileCount: 2,
  ...over,
})

const page = <T,>(items: T[]) => ({
  items,
  page: 1,
  pageSize: 24,
  total: items.length,
  pageCount: 1,
  hasMore: false,
})

const renderWith = (node: ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })

  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

beforeEach(() => {
  for (const fn of Object.values(api)) {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as ReturnType<typeof vi.fn>).mockReset()
  }

  api.listFolders.mockResolvedValue({ tree: [folder()], total: 1, truncated: false })
  api.listFiles.mockResolvedValue(page([asset()]))
  api.listReferences.mockResolvedValue(page([]))
})

afterEach(cleanup)

/* ------------------------------------------------------------ navigation */

describe('where Media lives', () => {
  it('is the ninth section, between Blog and Invoices', () => {
    const labels = dashboardNavigation.map((item) => item.label)

    expect(labels).toHaveLength(9)
    expect(labels.indexOf('Media')).toBe(labels.indexOf('Blog') + 1)
    expect(labels.indexOf('Media')).toBe(labels.indexOf('Invoices') - 1)
    expect(dashboardNavigation.find((item) => item.label === 'Media')?.to).toBe('/dashboard/media')
  })
})

/* --------------------------------------------------------------- library */

describe('the library', () => {
  it('puts the use state on every file, not only in the panel', async () => {
    api.listFiles.mockResolvedValue(
      page([
        asset({ id: 'a1', displayName: 'live.png', referenceCount: 1, isPublished: true }),
        asset({ id: 'a2', displayName: 'draft.png', referenceCount: 1, isPublished: false }),
        asset({ id: 'a3', displayName: 'spare.png', referenceCount: 0 }),
      ]),
    )

    renderWith(<MediaPage />)

    await waitFor(() => expect(screen.getByText('live.png')).toBeTruthy())

    // Each state carries its own word; none of them rests on colour.
    expect(screen.getAllByText('Live').length).toBeGreaterThan(0)
    expect(screen.getAllByText('In use').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Unused').length).toBeGreaterThan(0)
  })

  it('asks the server for the filter rather than slicing in the browser', async () => {
    renderWith(<MediaPage />)

    await waitFor(() => expect(api.listFiles).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Use'), { target: { value: 'unused' } })

    await waitFor(() =>
      expect(api.listFiles).toHaveBeenLastCalledWith(
        expect.objectContaining({ usage: 'unused', page: 1 }),
      ),
    )

    fireEvent.change(screen.getByLabelText('File type'), { target: { value: 'document' } })

    await waitFor(() =>
      expect(api.listFiles).toHaveBeenLastCalledWith(
        expect.objectContaining({ kind: 'document', usage: 'unused' }),
      ),
    )
  })

  it('offers the whole library and the loose files as different places', async () => {
    renderWith(<MediaPage />)

    // The rail button, not the phone-width <option> that carries the same
    // name — and only once the folder tree has actually arrived.
    const railRow = await waitFor(() => {
      const found = screen
        .getAllByText('Loose files')
        .map((node) => node.closest('button'))
        .find((node): node is HTMLButtonElement => node !== null)

      expect(found).toBeTruthy()

      return found!
    })

    fireEvent.click(railRow)

    await waitFor(() =>
      expect(api.listFiles).toHaveBeenLastCalledWith(expect.objectContaining({ folderId: 'root' })),
    )
  })

  it('shows where a file is used when it is opened', async () => {
    api.listFiles.mockResolvedValue(page([asset({ referenceCount: 2, isPublished: true })]))
    api.listReferences.mockResolvedValue(
      page([
        {
          id: 'r1',
          module: 'projects',
          scope: 'published',
          ownerType: 'project_version',
          ownerId: 'p1',
          usage: 'cover',
          position: 0,
          label: 'Tea Shop Sulaymaniyah',
          createdAt: '2026-09-12T10:00:00.000Z',
        },
      ]),
    )

    renderWith(<MediaPage />)

    fireEvent.click(await screen.findByText('tea-shop-cover.png'))

    expect(await screen.findByText('Used in 2 places')).toBeTruthy()
    expect(await screen.findByText(/Tea Shop Sulaymaniyah/)).toBeTruthy()
    expect(screen.getByText(/Live on the site · Cover image/)).toBeTruthy()
  })

  it('will not offer to delete a file that something uses', async () => {
    api.listFiles.mockResolvedValue(page([asset({ referenceCount: 1 })]))

    renderWith(<MediaPage />)

    fireEvent.click(await screen.findByText('tea-shop-cover.png'))

    const button = await screen.findByRole('button', { name: /cannot delete/i })

    expect((button as HTMLButtonElement).disabled).toBe(true)
    expect(api.deleteFile).not.toHaveBeenCalled()
  })

  it('turns the server refusal into a list of places, not a shrug', async () => {
    api.listFiles.mockResolvedValue(page([asset({ referenceCount: 0 })]))
    // The race this covers is real: a module can write a reference between the
    // grid being drawn and the confirm being clicked.
    api.deleteFile.mockRejectedValue(
      new ApiRequestError({
        message: 'That file is used in 1 place.',
        code: 'DELETE_BLOCKED_BY_REFERENCES',
        status: 409,
        details: {
          referenceCount: 1,
          references: [
            {
              id: 'r1',
              module: 'blog',
              scope: 'published',
              ownerType: 'blog_post_version',
              ownerId: 'post-1',
              usage: 'cover',
              position: 0,
              label: 'Warum ein Café eine Website braucht',
              createdAt: '2026-09-12T10:00:00.000Z',
            },
          ],
        },
      }),
    )

    renderWith(<MediaPage />)

    fireEvent.click(await screen.findByText('tea-shop-cover.png'))
    fireEvent.click(await screen.findByRole('button', { name: /delete permanently/i }))

    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: /delete permanently/i }))

    expect(await screen.findByText(/Still in use in 1 place/)).toBeTruthy()
    expect(screen.getByText(/Warum ein Café/)).toBeTruthy()
  })

  it('refuses an empty folder name before it ever reaches the server', async () => {
    renderWith(<MediaPage />)

    fireEvent.click(await screen.findByRole('button', { name: /new folder/i }))

    const dialog = await screen.findByRole('dialog')

    // Nothing is marked invalid until the first submit.
    expect(within(dialog).getByLabelText('Folder name').getAttribute('aria-invalid')).toBe(null)

    fireEvent.click(within(dialog).getByRole('button', { name: /create folder/i }))

    await waitFor(() =>
      expect(within(dialog).getByLabelText('Folder name').getAttribute('aria-invalid')).toBe('true'),
    )
    expect(api.createFolder).not.toHaveBeenCalled()

    // A slash is a path, and a folder name is a label.
    fireEvent.change(within(dialog).getByLabelText('Folder name'), {
      target: { value: 'Projects/2026' },
    })

    await waitFor(() => expect(within(dialog).getByText(/cannot contain a slash/i)).toBeTruthy())

    fireEvent.change(within(dialog).getByLabelText('Folder name'), { target: { value: '2026' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /create folder/i }))

    await waitFor(() =>
      expect(api.createFolder).toHaveBeenCalledWith({ name: '2026', parentId: null }),
    )
  })

  /**
   * Missed on the first build and caught by clicking around the real
   * dashboard: the specification says the owner "can create, rename, and
   * browse folders", and only create had a control.
   */
  it('lets a folder be renamed and deleted, but only when one is open', async () => {
    renderWith(<MediaPage />)

    await waitFor(() => expect(screen.getByText('All files')).toBeTruthy())

    // Nothing to act on while the whole library is shown.
    expect(screen.queryByRole('button', { name: /rename folder/i })).toBeNull()

    const railRow = await waitFor(() => {
      const found = screen
        .getAllByText('Projects')
        .map((node) => node.closest('button'))
        .find((node): node is HTMLButtonElement => node !== null)

      expect(found).toBeTruthy()

      return found!
    })

    fireEvent.click(railRow)

    fireEvent.click(await screen.findByRole('button', { name: /rename folder/i }))

    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText('Folder name'), {
      target: { value: 'Portfolio' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /save name/i }))

    await waitFor(() =>
      expect(api.updateFolder).toHaveBeenCalledWith('f-projects', {
        name: 'Portfolio',
        parentId: undefined,
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: /delete the folder/i }))

    const confirm = await screen.findByRole('dialog')

    // The promise it makes before deleting anything.
    expect(within(confirm).getByText(/never deletes a file/i)).toBeTruthy()

    fireEvent.click(within(confirm).getByRole('button', { name: /delete folder/i }))

    await waitFor(() => expect(api.deleteFolder).toHaveBeenCalledWith('f-projects'))
  })

  it('says the library is empty in a way that offers the next step', async () => {
    api.listFiles.mockResolvedValue(page([]))

    renderWith(<MediaPage />)

    expect(await screen.findByText('The library is empty')).toBeTruthy()
    // An empty screen is an invitation to act, not a dead end.
    expect(screen.getByRole('button', { name: /upload from computer/i })).toBeTruthy()
  })

  it('reports a failed read instead of pretending the vault is empty', async () => {
    api.listFiles.mockRejectedValue(new Error('the network is off'))

    renderWith(<MediaPage />)

    expect(await screen.findByText('The library could not be loaded')).toBeTruthy()
    expect(screen.queryByText('The library is empty')).toBeNull()
  })
})

/* ---------------------------------------------------------------- picker */

describe('the shared picker', () => {
  it('is the same browser, and adds to the library before selecting', async () => {
    const chosen = vi.fn()

    renderWith(
      <MediaPicker open onClose={() => {}} onChoose={chosen} kind="image" />,
    )

    // Same rail, same filters — the picker is the library with the verbs gone.
    await waitFor(() => expect(screen.getByText('All files')).toBeTruthy())
    expect(screen.getByLabelText('Use')).toBeTruthy()
    expect(screen.getByRole('button', { name: /upload from computer/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()

    // It asks the server only for the family it was opened for.
    await waitFor(() =>
      expect(api.listFiles).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'image' })),
    )

    const confirm = screen.getByRole('button', { name: /use this file/i }) as HTMLButtonElement

    expect(confirm.disabled).toBe(true)

    fireEvent.click(await screen.findByText('tea-shop-cover.png'))

    await waitFor(() => expect(confirm.disabled).toBe(false))

    fireEvent.click(confirm)

    expect(chosen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }))
  })

  it('closes on Escape without choosing anything', async () => {
    const chosen = vi.fn()
    const closed = vi.fn()

    renderWith(<MediaPicker open onClose={closed} onChoose={chosen} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy())

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(closed).toHaveBeenCalled()
    expect(chosen).not.toHaveBeenCalled()
  })
})

/* --------------------------------------------------------------- uploads */

describe('uploading', () => {
  it('gives each file its own line, and each refusal its own sentence', async () => {
    api.uploadFile.mockImplementation(({ file }: { file: File }) => ({
      abort: () => {},
      promise:
        file.name.endsWith('.html')
          ? Promise.reject(
              new ApiRequestError({
                message: 'That file type is not accepted. Images, MP4/MOV/WebM video, PDF, Office and OpenDocument files, RTF, text and ZIP are.',
                code: 'UNSUPPORTED_FILE_TYPE',
                status: 422,
              }),
            )
          : Promise.resolve({ asset: asset({ id: 'new', displayName: file.name }), duplicateOf: [] }),
    }))

    renderWith(<MediaPage />)

    await waitFor(() => expect(screen.getByText('tea-shop-cover.png')).toBeTruthy())

    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(input, 'files', {
      value: [
        new File(['x'], 'poster.png', { type: 'image/png' }),
        new File(['x'], 'page.html', { type: 'text/html' }),
      ],
    })
    fireEvent.change(input)

    expect(await screen.findByText(/Added to the library root/)).toBeTruthy()

    const refusal = await screen.findByText(/That file type is not accepted/)

    expect(refusal).toBeTruthy()
    // A refusal is announced assertively, so it is not missed.
    expect(refusal.getAttribute('aria-live')).toBe('assertive')
  })

  /**
   * Found by uploading into the real dashboard: the files landed on the
   * server and the grid went on showing "nothing matches those filters".
   *
   * An upload calls the API directly rather than through a mutation — it needs
   * `XMLHttpRequest` for progress — so nothing was telling the cached page or
   * the folder counts that the library had changed.
   */
  it('re-reads the library once a file has landed', async () => {
    api.uploadFile.mockReturnValue({
      abort: () => {},
      promise: Promise.resolve({ asset: asset({ id: 'new' }), duplicateOf: [] }),
    })

    renderWith(<MediaPage />)

    await waitFor(() => expect(screen.getByText('tea-shop-cover.png')).toBeTruthy())

    const before = api.listFiles.mock.calls.length
    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'fresh.png', { type: 'image/png' })],
    })
    fireEvent.change(input)

    await waitFor(() => expect(api.listFiles.mock.calls.length).toBeGreaterThan(before))
    // The folder counts come from the same invalidation.
    await waitFor(() => expect(api.listFolders.mock.calls.length).toBeGreaterThan(1))
  })

  it('mentions a duplicate rather than hiding or refusing it', async () => {
    api.uploadFile.mockReturnValue({
      abort: () => {},
      promise: Promise.resolve({ asset: asset({ id: 'new' }), duplicateOf: ['a1'] }),
    })

    renderWith(<MediaPage />)

    await waitFor(() => expect(screen.getByText('tea-shop-cover.png')).toBeTruthy())

    const input = document.querySelector('input[type="file"]') as HTMLInputElement

    Object.defineProperty(input, 'files', {
      value: [new File(['x'], 'again.png', { type: 'image/png' })],
    })
    fireEvent.change(input)

    expect(await screen.findByText(/already in the library/i)).toBeTruthy()
  })
})
