// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callCopy } from '#/frontend/features/call/call-copy'
import { type FakePerson, fakeRealtimeKitModule, installFakeMedia, lastFakeCall, refuseNextFakeCall, resetFakeCalls } from './helpers/fake-realtimekit'

/**
 * The call screen on RealtimeKit (approved Booking Design Lab, "the call"):
 * both people, their microphones and cameras, the other voice played out
 * loud (or a button when the browser holds it back), screen sharing, chat
 * that is never stored, the over-time banner, and every way the call ends.
 */

vi.mock('@cloudflare/realtimekit', () => fakeRealtimeKitModule())

const { VideoCall } = await import('#/frontend/features/call/VideoCall')

const copy = callCopy.en
const later = () => new Date(Date.now() + 30 * 60_000).toISOString()

const open = async (over: { endsAt?: string; role?: 'host' | 'guest' } = {}) => {
  const onExit = vi.fn()

  render(<VideoCall token="tok-1" copy={copy} role={over.role ?? 'guest'} otherName="Yaman" endsAt={over.endsAt ?? later()} onExit={onExit} />)
  // The first open also loads the SDK module, which can take a moment on a cold run.
  await screen.findByText('Waiting for Yaman…', undefined, { timeout: 5000 })

  return { call: lastFakeCall(), onExit }
}

let media: ReturnType<typeof installFakeMedia>

beforeEach(() => {
  resetFakeCalls()
  media = installFakeMedia()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('the call screen', () => {
  it('joins with the token it was given, camera and microphone on, and waits for the other person', async () => {
    const { call } = await open()

    expect(call.token).toBe('tok-1')
    expect(call.joined).toBe(true)
    await waitFor(() => expect(call.self.registered.size).toBe(1))
    expect(screen.getByText('You')).toBeTruthy()
  })

  it('shows the other person when they arrive, plays their voice, and marks them muted', async () => {
    const { call } = await open()

    let dana!: FakePerson

    act(() => {
      dana = call.addPerson({ id: 'p1', name: 'Dana' })
    })

    await screen.findByText('Yaman')
    expect(screen.queryByText('Waiting for Yaman…')).toBeNull()
    await waitFor(() => expect(dana.registered.size).toBe(1))

    act(() => call.setAudio('p1', true))
    expect(media.plays).toBeGreaterThan(0)

    act(() => call.setAudio('p1', false))
    expect(screen.getByText('Yaman').querySelector('svg')).toBeTruthy()

    act(() => call.removePerson('p1'))
    await screen.findByText('Waiting for Yaman…')
  })

  it('turns the microphone and camera off and on again', async () => {
    const { call } = await open()

    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    await waitFor(() => expect(call.self.audioEnabled).toBe(false))
    expect(screen.getByRole('button', { name: 'Unmute' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }))
    await waitFor(() => expect(call.self.audioEnabled).toBe(true))

    fireEvent.click(screen.getByRole('button', { name: 'Turn camera off' }))
    await waitFor(() => expect(call.self.videoEnabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Turn camera on' }))
    await waitFor(() => expect(call.self.videoEnabled).toBe(true))
  })

  it('offers screen sharing only where the browser can share a screen', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {} })
    await open()
    expect(screen.queryByRole('button', { name: 'Share screen' })).toBeNull()
    cleanup()

    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: () => {} } })
    const { call } = await open()

    fireEvent.click(screen.getByRole('button', { name: 'Share screen' }))
    await waitFor(() => expect(call.self.screenShareEnabled).toBe(true))
    await screen.findByRole('button', { name: 'Stop sharing' })
  })

  it('asks for one press when the browser holds the sound back', async () => {
    media.blocked = true

    const { call } = await open()

    act(() => {
      call.addPerson({ id: 'p1', name: 'Dana' })
      call.setAudio('p1', true)
    })

    await screen.findByText(copy.sound.blocked)
    media.blocked = false
    fireEvent.click(screen.getByRole('button', { name: /Turn on sound/ }))
    await waitFor(() => expect(screen.queryByText(copy.sound.blocked)).toBeNull())
  })

  it('chats without keeping anything, and counts what arrived while the chat was closed', async () => {
    const { call } = await open()

    act(() => call.receive('Hello!'))
    expect(screen.getByRole('button', { name: 'Messages' }).textContent).toContain('1')

    fireEvent.click(screen.getByRole('button', { name: 'Messages' }))
    expect(screen.getByText(copy.chat.notice)).toBeTruthy()
    expect(screen.getByText('Hello!')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Write a message…'), { target: { value: '  Hi Dana  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Hi Dana')
    expect(call.chat.sent).toEqual(['Hi Dana'])
  })

  it('says when the planned time is over, without ending anything', async () => {
    await open({ endsAt: new Date(Date.now() - 60_000).toISOString() })

    expect(screen.getByText('The planned time is over. The call stays open until Yaman ends it.')).toBeTruthy()
    cleanup()

    await open({ endsAt: new Date(Date.now() - 60_000).toISOString(), role: 'host' })
    expect(screen.getByText(copy.overtime.host)).toBeTruthy()
  })

  it('names a blocked camera in words the person can act on', async () => {
    const { call } = await open()

    act(() => call.self.emit('mediaPermissionUpdate', { kind: 'video', message: 'DENIED' }))
    expect(screen.getByText(copy.errors.denied)).toBeTruthy()
  })
})

describe('how the call ends', () => {
  it('leaves when the person presses Leave', async () => {
    const { call, onExit } = await open()

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }))
    await waitFor(() => expect(onExit).toHaveBeenCalledWith('left'))
    expect(call.left).toBe(true)
    expect(onExit).toHaveBeenCalledTimes(1)
  })

  it('reports being removed, a dropped connection, and a call that never opened', async () => {
    let opened = await open()

    act(() => opened.call.removed('kicked'))
    expect(opened.onExit).toHaveBeenCalledWith('removed')
    cleanup()

    opened = await open()
    act(() => opened.call.removed('disconnected'))
    expect(opened.onExit).toHaveBeenCalledWith('lost')
    cleanup()

    refuseNextFakeCall()

    const onExit = vi.fn()

    render(<VideoCall token="bad" copy={copy} role="guest" otherName="Yaman" endsAt={later()} onExit={onExit} />)
    await waitFor(() => expect(onExit).toHaveBeenCalledWith('failed'))
  })

  it('leaves the room when the screen goes away', async () => {
    const { call } = await open()

    cleanup()
    expect(call.left).toBe(true)
  })
})
