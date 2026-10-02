// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { InboxDraft } from '#/backend2/contracts/inbox.contract'
import type { RichTextDoc } from '#/backend2/contracts/rich-text.contract'
import { richTextToPlainText } from '#/backend2/contracts/rich-text.contract'

const api = vi.hoisted(() => ({ readDraft: vi.fn(), saveDraft: vi.fn(), sendDraft: vi.fn(), listDrafts: vi.fn(), readSettings: vi.fn(), listSnippets: vi.fn(), discardDraft: vi.fn() }))
vi.mock('#/frontend/features/inbox-v2/api', async (original) => ({ ...(await original<object>()), ...api }))
vi.mock('#/frontend/features/media/MediaPicker', () => ({ MediaPicker: () => null }))
vi.mock('#/frontend/features/inbox-v2/EmailEditor', () => ({
  textToParagraphs: (text: string) => [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  EmailEditor: ({ value, onChange }: { value: RichTextDoc; onChange: (doc: RichTextDoc) => void }) => (
    <textarea aria-label="Message" value={richTextToPlainText(value)} onChange={(event) => onChange(doc(event.target.value))} />
  ),
}))

const { Composer } = await import('#/frontend/pages/dashboard/inbox/Composer')
const { inboxKeys, useDrafts } = await import('#/frontend/features/inbox-v2/queries')
const { localDraft } = await import('#/frontend/pages/dashboard/inbox/inbox-parts')

const doc = (text: string): RichTextDoc => ({ type: 'doc', content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }] })
let server: InboxDraft
let client: QueryClient

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  server = { id: 'qa-draft', conversationId: null, toEmail: '', subject: 'Old subject', bodyDoc: doc('Old text'), language: 'en', revision: 1, attachments: [{ assetId: 'qa-file', fileName: 'sample.pdf', contentType: 'application/pdf', byteSize: 100 }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), conversationSubject: null }
  api.readDraft.mockImplementation(async () => structuredClone(server))
  api.readSettings.mockResolvedValue({ signatures: { en: '', de: '', ar: '' }, sendMode: 'fake' })
  api.listSnippets.mockResolvedValue({ items: [], total: 0 })
  api.listDrafts.mockImplementation(async () => ({ items: [structuredClone(server)], total: 1, page: 1, pageSize: 25, pageCount: 1, hasMore: false }))
  api.saveDraft.mockImplementation(async (_id, input) => {
    if (input.revision !== server.revision) throw new Error('Stale revision')
    server = { ...server, subject: input.subject, toEmail: input.toEmail ?? server.toEmail, bodyDoc: input.bodyDoc, language: input.language, revision: server.revision + 1, updatedAt: new Date().toISOString() }
    return structuredClone(server)
  })
})
afterEach(() => { cleanup(); client.clear() })

function Harness() {
  const [open, setOpen] = useState(true)
  const list = useDrafts(1)
  return <>
    <p data-testid="draft-row">{list.data?.items[0]?.subject}</p>
    <button onClick={() => setOpen(true)}>Open draft</button>
    {open ? <Composer draftId="qa-draft" mode="new" full onClose={() => setOpen(false)} onSent={() => setOpen(false)} /> : null}
  </>
}
const mount = () => render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>)

describe('draft persistence in the composer', () => {
  it('saves, updates the list, reopens the saved text and edits again without a false conflict', async () => {
    mount()
    fireEvent.change(await screen.findByLabelText('Subject'), { target: { value: 'Latest subject' } })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Latest text https://example.com' } })
    expect(screen.getByText('Unsaved changes')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Close and keep the draft' }))
    await waitFor(() => expect(screen.queryByLabelText('Subject')).toBeNull())
    await waitFor(() => expect(screen.getByTestId('draft-row').textContent).toBe('Latest subject'))
    fireEvent.click(screen.getByRole('button', { name: 'Open draft' }))
    expect((await screen.findByLabelText('Subject') as HTMLInputElement).value).toBe('Latest subject')
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Latest text https://example.com')
    expect(screen.getByText('sample.pdf')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Edited again' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close and keep the draft' }))
    await waitFor(() => expect(server.subject).toBe('Edited again'))
    expect(api.saveDraft.mock.calls[1][1].revision).toBe(2)
    expect(api.sendDraft).not.toHaveBeenCalled()
  })

  it('keeps the editor open and preserves a local copy when closing cannot save', async () => {
    api.saveDraft.mockRejectedValue(new Error('Offline'))
    mount()
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'Text while offline' } })
    fireEvent.click(screen.getByRole('button', { name: 'Close and keep the draft' }))
    expect(await screen.findByText(/Couldn't save/u)).toBeTruthy()
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Text while offline')
    expect(localDraft.read<InboxDraft>('qa-draft')?.bodyDoc).toEqual(doc('Text while offline'))
    expect(server.bodyDoc).toEqual(doc('Old text'))
  })

  it('does not erase newer text when an earlier autosave finishes', async () => {
    let finish!: (draft: InboxDraft) => void
    api.saveDraft.mockImplementationOnce(() => new Promise<InboxDraft>((resolve) => { finish = resolve }))
    mount()
    fireEvent.change(await screen.findByLabelText('Message'), { target: { value: 'First edit' } })
    await waitFor(() => expect(api.saveDraft).toHaveBeenCalledTimes(1), { timeout: 2000 })
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Newer unsaved edit' } })
    await act(async () => finish({ ...server, bodyDoc: doc('First edit'), revision: 2 }))
    expect(localDraft.read<InboxDraft>('qa-draft')?.bodyDoc).toEqual(doc('Newer unsaved edit'))
    expect(client.getQueryData<InboxDraft>(inboxKeys.draft('qa-draft'))?.bodyDoc).toEqual(doc('First edit'))
  })
})
