// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONTACT_FILE_ACCEPT, CONTACT_LIMITS } from '#/backend2/contracts/contact.contract'

/**
 * Public cutover step 6: the Contact form behind the switch.
 *
 * Off, the page keeps today's form, which posts to the legacy `/api/contact`.
 * On, the same page posts to Backend2 — without the two selects the owner
 * removed from Contact, with one checked attachment, and with one
 * `submissionId` per fill so a retry can never become a second conversation.
 */

const state = vi.hoisted(() => ({ language: 'en' as 'de' | 'en' | 'ar' }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('#/frontend/i18n/language-provider', () => ({
  useLanguage: () => ({ language: state.language, isRtl: state.language === 'ar' }),
}))
vi.mock('#/frontend/motion', () => ({
  SplitWords: ({ text }: { text: string }) => <>{text}</>,
  useReveal: () => () => {},
  useTilt: () => () => {},
}))
// The human check passes at once; the real widget talks to Cloudflare.
vi.mock('#/frontend/features/security/TurnstileWidget', () => ({
  TurnstileWidget: ({ onTokenChange, resetKey }: { onTokenChange: (token: string | null) => void; resetKey: number }) => {
    useEffect(() => onTokenChange(`turnstile-${resetKey}`), [onTokenChange, resetKey])

    return null
  },
}))
// The booking card beside the form has its own tests.
vi.mock('#/frontend/features/booking/BookingAside', () => ({ BookingAside: () => null }))

const { ContactPage } = await import('#/frontend/pages/public/contact/ContactPage')
// The V2 form is its own chunk; the route loader fetches it before rendering, and so does this file.
await (await import('#/frontend/features/contact/contact-v2-lazy')).contactFormV2.preload()
const { CONTACT_V2_ACCEPT, CONTACT_V2_ENDPOINT, CONTACT_V2_LIMITS, fileProblem } = await import('#/frontend/features/contact/contact-v2')
const { site } = await import('#/frontend/content/site')
const { readsFromV2 } = await import('#/backend2/public-source')

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const received = () => json(201, { success: true, message: 'Message received', data: { received: true } })

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  state.language = 'en'
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

const type = (label: RegExp | string, value: string) =>
  fireEvent.change(screen.getByLabelText(label, { exact: false }), { target: { value } })

const fillValid = () => {
  type('Name', 'Dana Example')
  type('Email', 'dana@example.com')
  fireEvent.change(document.getElementById('message')!, { target: { value: 'We would like a new website for our bakery.' } })
}

const submit = () => fireEvent.click(screen.getByRole('button', { name: /send/i }))

const sentForm = (call: number) => fetchMock.mock.calls[call]![1].body as FormData

describe('the switch', () => {
  it('reads Contact and Booking from Backend2 only when listed and a V2 database exists', () => {
    const db = { DATABASE_URL_V2: 'postgres://x/y' }

    expect(readsFromV2('contact', { ...db })).toBe(false)
    expect(readsFromV2('contact', { ...db, PUBLIC_V2_MODULES: 'contact' })).toBe(true)
    expect(readsFromV2('booking', { ...db, PUBLIC_V2_MODULES: 'contact' })).toBe(false)
    expect(readsFromV2('booking', { ...db, PUBLIC_V2_MODULES: 'booking,contact' })).toBe(true)
    expect(readsFromV2('contact', { PUBLIC_V2_MODULES: 'contact' })).toBe(false)
  })
})

describe('client rules equal the contract', () => {
  it('copies the limits and the accepted files exactly', () => {
    expect(CONTACT_V2_LIMITS).toEqual(CONTACT_LIMITS)
    expect(CONTACT_V2_ACCEPT).toBe(CONTACT_FILE_ACCEPT)
  })

  it('names a file that is too large or of a kind the form does not take', () => {
    expect(fileProblem({ name: 'brief.pdf', size: 1000 })).toBeNull()
    expect(fileProblem({ name: 'Plan.DOCX', size: CONTACT_LIMITS.fileBytes })).toBeNull()
    expect(fileProblem({ name: 'clip.mp4', size: CONTACT_LIMITS.fileBytes + 1 })).toBe('size')
    expect(fileProblem({ name: 'tool.exe', size: 10 })).toBe('type')
    expect(fileProblem({ name: 'no-extension', size: 10 })).toBe('type')
  })
})

describe('switch off — the legacy form', () => {
  it('keeps both selects and posts to the legacy endpoint', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    render(<ContactPage />)

    expect(document.getElementById('projectType')).not.toBeNull()
    expect(document.getElementById('budget')).not.toBeNull()

    type('Name', 'Dana Example')
    type('Email', 'dana@example.com')
    fireEvent.change(document.getElementById('message')!, { target: { value: 'We would like a new website.' } })
    fireEvent.submit(document.querySelector('form')!)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls[0]![0]).toBe(site.contactEndpoint)
    expect(fetchMock.mock.calls[0]![0]).not.toBe(CONTACT_V2_ENDPOINT)
  })
})

describe('switch on — the Backend2 form', () => {
  it('has no "What is it about?" or "Budget range" select', () => {
    render(<ContactPage v2 />)

    expect(document.getElementById('projectType')).toBeNull()
    expect(document.getElementById('budget')).toBeNull()
    expect(document.querySelector('select')).toBeNull()
  })

  it('says nothing before the first press, then marks and focuses the first wrong field', async () => {
    render(<ContactPage v2 />)

    expect(screen.queryByText('Please enter your name.', { exact: false })).toBeNull()
    expect(document.querySelectorAll('[aria-invalid="true"]')).toHaveLength(0)

    await act(async () => submit())

    await waitFor(() => expect(document.getElementById('name')?.getAttribute('aria-invalid')).toBe('true'))
    expect(document.getElementById('email')?.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById('message')?.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById('name')?.getAttribute('aria-describedby')).toBe('name-error')
    expect(document.getElementById('name-error')).not.toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('name')))
    expect(fetchMock).not.toHaveBeenCalled()

    // After the first press, fixing a field clears its message as you type.
    type('Name', 'Dana')
    await waitFor(() => expect(document.getElementById('name')?.getAttribute('aria-invalid')).toBe('false'))
  })

  it('refuses a file over 10 MB or of the wrong kind as soon as it is chosen', async () => {
    render(<ContactPage v2 />)
    const input = document.getElementById('attachment') as HTMLInputElement
    const big = new File(['x'], 'film.mp4', { type: 'video/mp4' })

    Object.defineProperty(big, 'size', { value: CONTACT_LIMITS.fileBytes + 1 })
    fireEvent.change(input, { target: { files: [big] } })
    expect(await screen.findByText(/larger than 10 MB/)).toBeTruthy()
    expect(input.getAttribute('aria-invalid')).toBe('true')

    fireEvent.change(input, { target: { files: [new File(['MZ'], 'setup.exe')] } })
    expect(await screen.findByText(/This kind of file cannot be sent/)).toBeTruthy()

    fillValid()
    await act(async () => submit())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts one multipart message with a submission id, the file and nothing about budget', async () => {
    fetchMock.mockResolvedValue(received())
    render(<ContactPage v2 />)
    fillValid()
    type('Company', 'Bakery Ltd')
    fireEvent.change(document.getElementById('attachment')!, {
      target: { files: [new File(['%PDF-1.4'], 'brief.pdf', { type: 'application/pdf' })] },
    })

    await act(async () => submit())
    await screen.findByRole('status')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe(CONTACT_V2_ENDPOINT)
    expect(fetchMock.mock.calls[0]![1].method).toBe('POST')

    const body = sentForm(0)

    expect(body.get('submissionId')).toMatch(/^[0-9a-f-]{36}$/u)
    expect(body.get('name')).toBe('Dana Example')
    expect(body.get('company')).toBe('Bakery Ltd')
    expect(body.get('language')).toBe('en')
    expect(body.get('turnstileToken')).toMatch(/^turnstile-/u)
    expect(body.get('website')).toBe('')
    expect((body.get('attachment') as File).name).toBe('brief.pdf')
    expect(body.has('projectType')).toBe(false)
    expect(body.has('budget')).toBe(false)
  })

  it('retries with the same submission id, so the Inbox gets one conversation', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down')).mockResolvedValueOnce(received())
    render(<ContactPage v2 />)
    fillValid()

    await act(async () => submit())
    expect((await screen.findByRole('alert')).textContent).toMatch(/did not work/i)

    await act(async () => submit())
    await screen.findByRole('status')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(sentForm(1).get('submissionId')).toBe(sentForm(0).get('submissionId'))
    // A Turnstile token is used once: the retry carries a fresh one.
    expect(sentForm(1).get('turnstileToken')).not.toBe(sentForm(0).get('turnstileToken'))
  })

  it('shows what the server refused next to the field', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(422, { success: false, code: 'VALIDATION_ERROR', message: 'Enter a valid email address', details: { issues: [{ field: 'email', message: 'x' }] } }),
      )
      .mockResolvedValueOnce(json(422, { success: false, code: 'UNSUPPORTED_FILE_TYPE', message: 'no', details: { field: 'attachment' } }))
      .mockResolvedValueOnce(json(429, { success: false, code: 'RATE_LIMITED', message: 'slow down' }))
    render(<ContactPage v2 />)
    fillValid()

    await act(async () => submit())
    await waitFor(() => expect(document.getElementById('email')?.getAttribute('aria-invalid')).toBe('true'))

    type('Email', 'dana@example.org')
    fireEvent.change(document.getElementById('attachment')!, {
      target: { files: [new File(['x'], 'renamed.pdf', { type: 'application/pdf' })] },
    })
    await act(async () => submit())
    expect(await screen.findByText(/This kind of file cannot be sent/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    await act(async () => submit())
    expect((await screen.findByRole('alert')).textContent).toMatch(/Too many messages/)
  })

  it('cannot be sent twice by a double press', async () => {
    let answer: (response: Response) => void = () => {}

    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)))
    render(<ContactPage v2 />)
    fillValid()

    await act(async () => {
      submit()
      submit()
    })

    expect((screen.getByRole('button', { name: /sending/i }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => answer(received()))
    await screen.findByRole('status')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps what a visitor typed before the page finished loading', async () => {
    fetchMock.mockResolvedValue(received())
    const { renderToString } = await import('react-dom/server')
    const { hydrateRoot } = await import('react-dom/client')
    const container = document.createElement('div')

    document.body.append(container)
    container.innerHTML = renderToString(<ContactPage v2 />)
    // Typed into the server's HTML, before React takes the page over.
    ;(container.querySelector('#name') as HTMLInputElement).value = 'Early Typer'
    ;(container.querySelector('#email') as HTMLInputElement).value = 'early@example.com'
    ;(container.querySelector('#message') as HTMLTextAreaElement).value = 'Typed before the script arrived.'

    const root = await act(async () => hydrateRoot(container, <ContactPage v2 />))

    expect((container.querySelector('#name') as HTMLInputElement).value).toBe('Early Typer')
    await act(async () => fireEvent.click(within(container).getByRole('button', { name: /send/i })))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(sentForm(0).get('name')).toBe('Early Typer')
    expect(sentForm(0).get('message')).toBe('Typed before the script arrived.')
    act(() => root.unmount())
    container.remove()
  })

  it('speaks the page language', async () => {
    state.language = 'ar'
    render(<ContactPage v2 />)
    fireEvent.change(document.getElementById('attachment')!, { target: { files: [new File(['x'], 'a.zip')] } })

    expect(await screen.findByText(/لا يمكن إرسال هذا النوع/)).toBeTruthy()
  })
})
