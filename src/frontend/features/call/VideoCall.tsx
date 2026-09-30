import { useEffect, useReducer, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type RealtimeKitClient from '@cloudflare/realtimekit'
import { Loader2, MessageSquare, Mic, MicOff, MonitorUp, PhoneOff, Send, Video, VideoOff, Volume2, X } from 'lucide-react'
import { cn } from '#/frontend/lib/utils'
import type { CallCopy } from './call-copy'

/**
 * The video call itself (approved Booking Design Lab, "the call"), on
 * Cloudflare RealtimeKit's core SDK. The same screen serves the visitor on
 * the website and the owner in the Dashboard; Backend2 has already decided
 * who may be here and handed over a one-person token.
 *
 * The SDK is fetched only when a call opens — it is large, and nobody else
 * needs it. Sound is played here, not by the SDK: one audio element carries
 * the other person's voice (and a shared screen's sound). A browser that
 * blocks sound until the page is touched gets a "Turn on sound" button.
 *
 * Nothing is recorded, and chat messages exist only while the call runs.
 */

type Client = RealtimeKitClient
type Remote = ReturnType<Client['participants']['joined']['toArray']>[number]
type ChatLine = { id: string; mine: boolean; name: string; text: string }

/** Why the call screen closed. The page decides what to show next. */
export type CallExit =
  /** The person pressed Leave. */
  | 'left'
  /** Removed by the other side: the owner ended the call, or the same seat opened elsewhere. */
  | 'removed'
  /** The connection dropped and did not come back. */
  | 'lost'
  /** The call never opened. */
  | 'failed'

export type VideoCallProps = {
  token: string
  copy: CallCopy
  role: 'host' | 'guest'
  /** The person on the other side, as the page knows them. */
  otherName: string
  /** The planned end. The call is not cut off there; a banner says so. */
  endsAt: string
  onExit: (why: CallExit) => void
}

/** The other person's voice. A single element so one "play" unlocks all of it. */
class Speaker {
  private readonly stream = new MediaStream()
  private readonly tracks = new Map<string, MediaStreamTrack>()

  constructor(
    private readonly element: HTMLAudioElement,
    private readonly onBlocked: () => void,
  ) {
    element.srcObject = this.stream
  }

  set(id: string, track: MediaStreamTrack | null | undefined): void {
    const old = this.tracks.get(id)

    if (old) {
      this.stream.removeTrack(old)
      this.tracks.delete(id)
    }

    if (track) {
      this.tracks.set(id, track)
      this.stream.addTrack(track)
      void this.play()
    }
  }

  async play(): Promise<boolean> {
    this.element.srcObject = this.stream

    try {
      await this.element.play()

      return true
    } catch (error) {
      if ((error as Error | undefined)?.name === 'NotAllowedError') this.onBlocked()

      return false
    }
  }

  stop(): void {
    this.element.pause()
    this.element.srcObject = null
  }
}

const PERMISSION_WORDS: Partial<Record<string, keyof CallCopy['errors']>> = {
  DENIED: 'denied',
  SYSTEM_DENIED: 'denied',
  COULD_NOT_START: 'inUse',
  NO_DEVICES_AVAILABLE: 'noDevice',
}

/**
 * The SDK is a browser library: the server build leaves it out entirely
 * (the call never renders there), so the Worker does not carry it.
 */
const loadSdk = import.meta.env.SSR ? null : () => import('@cloudflare/realtimekit')

const canShareScreen = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'

const initialOf = (name: string): string => (name.trim()[0] ?? '?').toUpperCase()

export function VideoCall({ token, copy, role, otherName, endsAt, onExit }: VideoCallProps) {
  const [client, setClient] = useState<Client | null>(null)
  const [, rerender] = useReducer((count: number) => count + 1, 0)
  const [soundBlocked, setSoundBlocked] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [lines, setLines] = useState<ChatLine[]>([])
  const [unread, setUnread] = useState(0)
  const [overtime, setOvertime] = useState(() => Date.now() > Date.parse(endsAt))
  const audio = useRef<HTMLAudioElement>(null)
  const speaker = useRef<Speaker | null>(null)
  const leaving = useRef(false)
  const chatOpenRef = useRef(chatOpen)
  const exit = useRef(onExit)

  exit.current = onExit
  chatOpenRef.current = chatOpen

  useEffect(() => {
    let active = true
    let meeting: Client | null = null
    const element = audio.current!
    const out = new Speaker(element, () => active && setSoundBlocked(true))

    speaker.current = out

    const close = (why: CallExit) => {
      if (!active) return
      active = false
      exit.current(why)
    }

    const open = async () => {
      try {
        if (!loadSdk) throw new Error('The call runs only in a browser')

        const { default: SDK } = await loadSdk()

        meeting = await SDK.init({ authToken: token, defaults: { audio: true, video: true } })
        if (!active) return

        const joined = meeting.participants.joined
        const onPeople = () => rerender()
        const onAudio = ({ id, audioEnabled, audioTrack }: { id: string; audioEnabled: boolean; audioTrack: MediaStreamTrack }) => {
          out.set(`voice-${id}`, audioEnabled ? audioTrack : null)
          rerender()
        }
        const onShare = ({ id, screenShareEnabled, screenShareTracks }: { id: string; screenShareEnabled: boolean; screenShareTracks: { audio?: MediaStreamTrack } }) => {
          out.set(`screen-${id}`, screenShareEnabled ? screenShareTracks.audio : null)
          rerender()
        }
        const onLeft = ({ id }: { id: string }) => {
          out.set(`voice-${id}`, null)
          out.set(`screen-${id}`, null)
          rerender()
        }

        joined.on('participantJoined', onPeople)
        joined.on('participantLeft', onLeft as never)
        joined.on('videoUpdate', onPeople)
        joined.on('audioUpdate', onAudio as never)
        joined.on('screenShareUpdate', onShare as never)
        meeting.self.on('videoUpdate', onPeople)
        meeting.self.on('audioUpdate', onPeople)
        meeting.self.on('screenShareUpdate', onPeople)
        meeting.self.on('mediaPermissionUpdate', ({ message }) => {
          const words = PERMISSION_WORDS[message]

          if (words) setNotice(copy.errors[words])
        })
        meeting.self.on('roomLeft', ({ state }) => {
          if (leaving.current) return
          close(state === 'kicked' || state === 'ended' ? 'removed' : state === 'left' ? 'left' : 'lost')
        })
        meeting.chat.on('chatUpdate', ({ action, message }) => {
          if (action !== 'add' || message.type !== 'text' || !meeting) return

          const mine = message.userId === meeting.self.userId

          setLines((current) => [
            ...current,
            { id: message.id, mine, name: mine ? copy.chat.you : message.displayName, text: (message as { message: string }).message },
          ])
          if (!mine && !chatOpenRef.current) setUnread((count) => count + 1)
        })

        await meeting.join()
        if (!active) return

        // Whoever was already here when we arrived.
        for (const person of joined.toArray()) {
          if (person.audioEnabled) out.set(`voice-${person.id}`, person.audioTrack)
          if (person.screenShareEnabled) out.set(`screen-${person.id}`, person.screenShareTracks.audio)
        }

        setClient(meeting)
      } catch (error) {
        console.error('Video call could not open', error instanceof Error ? error.name : 'unknown')
        close('failed')
      }
    }

    void open()

    return () => {
      active = false
      out.stop()
      speaker.current = null
      if (meeting?.self.roomJoined) {
        leaving.current = true
        void meeting.leave().catch(() => {})
      }
    }
    // The copy only words a notice; a new token is a new call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  useEffect(() => {
    const check = () => setOvertime(Date.now() > Date.parse(endsAt))
    const timer = window.setInterval(check, 15_000)

    check()

    return () => window.clearInterval(timer)
  }, [endsAt])

  const leave = async () => {
    leaving.current = true
    await client?.leave().catch(() => {})
    exit.current('left')
  }

  const other = client?.participants.joined.toArray()[0] as Remote | undefined
  const sharing = other?.screenShareEnabled ? other : null
  const self = client?.self

  return (
    <div className="relative flex h-full min-h-[28rem] w-full flex-col overflow-hidden rounded-[1.4rem] bg-[#0b0f1d] text-[#edf3ff]">
      <audio ref={audio} autoPlay className="hidden" />

      {overtime ? (
        <p role="status" className="m-0 bg-[#2f2816] px-4 py-2 text-center text-[13px] text-[#ffcf73]">
          {role === 'guest' ? copy.overtime.guest.replace('{name}', otherName) : copy.overtime.host}
        </p>
      ) : null}
      {soundBlocked ? (
        <div role="alert" className="flex flex-wrap items-center justify-center gap-3 bg-[#1b2748] px-4 py-2 text-[13px] text-[#a8c2ff]">
          {copy.sound.blocked}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-[#355cff] px-3 py-1 font-semibold text-white"
            onClick={async () => {
              if (await speaker.current?.play()) setSoundBlocked(false)
            }}
          >
            <Volume2 aria-hidden="true" className="size-4" />
            {copy.sound.enable}
          </button>
        </div>
      ) : null}
      {notice ? (
        <p role="alert" className="m-0 bg-[#2f2233] px-4 py-2 text-center text-[13px] text-[#ff8d9b]">
          {notice}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {client && self ? (
          <div className={cn('grid min-h-0 flex-1 gap-2.5 p-3 sm:p-3.5', sharing ? 'grid-rows-[minmax(0,1fr)_auto]' : '')}>
            {sharing ? <ScreenTile person={sharing} label={`${otherName} · ${copy.people.sharing}`} /> : null}
            <div className={cn('grid min-h-0 gap-2.5', sharing ? 'h-28 grid-cols-2 sm:h-36' : 'grid-cols-1 sm:grid-cols-2')}>
              <Tile
                label={copy.people.you + (self.screenShareEnabled ? ` · ${copy.people.sharing}` : '')}
                initial={initialOf(self.name || copy.people.you)}
                showVideo={self.videoEnabled}
                muted={!self.audioEnabled}
                mirror
                attach={(element) => {
                  self.registerVideoElement(element)

                  return () => self.deregisterVideoElement(element)
                }}
              />
              {other ? (
                <Tile
                  key={other.id}
                  label={otherName}
                  initial={initialOf(otherName)}
                  showVideo={other.videoEnabled}
                  muted={!other.audioEnabled}
                  attach={(element) => {
                    other.registerVideoElement(element)

                    return () => other.deregisterVideoElement(element)
                  }}
                />
              ) : (
                <div className="grid min-h-40 place-items-center rounded-[14px] bg-[radial-gradient(circle_at_50%_40%,#28345c,#121a31)] p-4 text-center">
                  <div className="grid gap-1.5">
                    <p className="m-0 text-[15px] font-semibold">{copy.waitingFor.replace('{name}', otherName)}</p>
                    <p className="m-0 text-[13px] text-[#a8b5d5]">{copy.waitingSub}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center p-6" role="status">
            <p className="m-0 inline-flex items-center gap-2 text-sm text-[#a8b5d5]">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              {copy.status.connecting}
            </p>
          </div>
        )}

        {chatOpen && client ? (
          <Chat
            copy={copy}
            lines={lines}
            onClose={() => setChatOpen(false)}
            onSend={(text) => client.chat.sendTextMessage(text)}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap justify-center gap-2 px-3 pt-1 pb-3.5">
        <CallButton
          label={self?.audioEnabled ? copy.controls.mute : copy.controls.unmute}
          pressed={self ? !self.audioEnabled : undefined}
          disabled={!self}
          onClick={() => void (self?.audioEnabled ? self.disableAudio() : self?.enableAudio())}
        >
          {self && !self.audioEnabled ? <MicOff aria-hidden="true" className="size-4" /> : <Mic aria-hidden="true" className="size-4" />}
        </CallButton>
        <CallButton
          label={self?.videoEnabled ? copy.controls.cameraOff : copy.controls.cameraOn}
          pressed={self ? !self.videoEnabled : undefined}
          disabled={!self}
          onClick={() => void (self?.videoEnabled ? self.disableVideo() : self?.enableVideo())}
        >
          {self && !self.videoEnabled ? <VideoOff aria-hidden="true" className="size-4" /> : <Video aria-hidden="true" className="size-4" />}
        </CallButton>
        {canShareScreen() ? (
          <CallButton
            label={self?.screenShareEnabled ? copy.controls.stopSharing : copy.controls.share}
            pressed={self?.screenShareEnabled}
            disabled={!self}
            onClick={() => void (self?.screenShareEnabled ? self.disableScreenShare() : self?.enableScreenShare())?.catch(() => {})}
          >
            <MonitorUp aria-hidden="true" className="size-4" />
          </CallButton>
        ) : null}
        <CallButton
          label={chatOpen ? copy.controls.closeChat : copy.controls.chat}
          pressed={chatOpen}
          disabled={!client}
          onClick={() => {
            setChatOpen((open) => !open)
            setUnread(0)
          }}
        >
          <MessageSquare aria-hidden="true" className="size-4" />
          {unread > 0 && !chatOpen ? (
            <span className="tabular rounded-full bg-[#355cff] px-1.5 text-[11px] leading-[18px] text-white">{unread}</span>
          ) : null}
        </CallButton>
        <CallButton label={copy.controls.leave} tone="end" onClick={() => void leave()}>
          <PhoneOff aria-hidden="true" className="size-4" />
        </CallButton>
      </div>
    </div>
  )
}

function CallButton({
  label,
  pressed,
  disabled,
  tone,
  onClick,
  children,
}: {
  label: string
  pressed?: boolean
  disabled?: boolean
  tone?: 'end'
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors disabled:opacity-50',
        tone === 'end' ? 'bg-[#ca4152] text-white hover:bg-[#b3202f]' : pressed ? 'bg-[#edf3ff] text-[#0b0f1d]' : 'bg-[#1f2944] text-[#edf3ff] hover:bg-[#2a3658]',
      )}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

function Tile({
  label,
  initial,
  showVideo,
  muted,
  mirror,
  attach,
}: {
  label: string
  initial: string
  showVideo: boolean
  muted: boolean
  mirror?: boolean
  attach: (element: HTMLVideoElement) => () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const attachRef = useRef(attach)

  attachRef.current = attach

  useEffect(() => {
    const element = video.current

    return element ? attachRef.current(element) : undefined
  }, [])

  return (
    <div className="relative grid min-h-40 place-items-center overflow-hidden rounded-[14px] bg-[radial-gradient(circle_at_50%_40%,#28345c,#121a31)]">
      <video
        ref={video}
        autoPlay
        playsInline
        muted
        className={cn('absolute inset-0 h-full w-full object-cover', mirror ? 'scale-x-[-1]' : '', showVideo ? '' : 'invisible')}
      />
      {showVideo ? null : (
        <span aria-hidden="true" className="grid size-20 place-items-center rounded-full bg-[#3b4a7c] text-3xl font-semibold">
          {initial}
        </span>
      )}
      <small className="absolute bottom-2 inline-flex items-center gap-1 rounded-md bg-black/35 px-2 py-0.5 text-xs text-[#cfd8f3] [inset-inline-start:0.625rem]">
        {muted ? <MicOff aria-hidden="true" className="size-3" /> : null}
        {label}
      </small>
    </div>
  )
}

function ScreenTile({ person, label }: { person: Remote; label: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const track = person.screenShareTracks.video

  useEffect(() => {
    const element = video.current

    if (!element || !track) return

    element.srcObject = new MediaStream([track])

    return () => {
      element.srcObject = null
    }
  }, [track])

  return (
    <div className="relative min-h-0 overflow-hidden rounded-[14px] bg-black">
      <video ref={video} autoPlay playsInline muted className="h-full w-full object-contain" />
      <small className="absolute bottom-2 rounded-md bg-black/50 px-2 py-0.5 text-xs text-[#cfd8f3] [inset-inline-start:0.625rem]">{label}</small>
    </div>
  )
}

function Chat({
  copy,
  lines,
  onClose,
  onSend,
}: {
  copy: CallCopy
  lines: ChatLine[]
  onClose: () => void
  onSend: (text: string) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => end.current?.scrollIntoView?.({ block: 'end' }), [lines.length])

  const submit = async (event: FormEvent) => {
    event.preventDefault()

    const text = draft.trim()

    if (!text || sending) return
    setSending(true)

    try {
      await onSend(text)
      setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <aside
      aria-label={copy.chat.title}
      className="absolute inset-x-0 bottom-16 z-10 flex max-h-[60%] flex-col border-t border-white/10 bg-[#10162a] sm:static sm:max-h-none sm:w-80 sm:border-t-0 sm:[border-inline-start:1px_solid_rgba(237,243,255,0.1)]"
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h2 className="m-0 text-sm font-semibold">{copy.chat.title}</h2>
        <button type="button" aria-label={copy.controls.closeChat} onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10">
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
      <p className="m-0 px-4 pt-1 text-[12px] text-[#a8b5d5]">{copy.chat.notice}</p>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3" aria-live="polite">
        {lines.length === 0 ? <p className="m-0 text-[13px] text-[#a8b5d5]">{copy.chat.empty}</p> : null}
        {lines.map((line) => (
          <p key={line.id} dir="auto" className={cn('m-0 max-w-[90%] rounded-xl px-3 py-2 text-[13px]', line.mine ? 'self-end bg-[#355cff] text-white' : 'self-start bg-[#1f2944]')}>
            <span className="block text-[11px] opacity-75">{line.name}</span>
            {line.text}
          </p>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(event) => void submit(event)} className="flex gap-2 border-t border-white/10 p-3">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={copy.chat.placeholder}
          aria-label={copy.chat.placeholder}
          dir="auto"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-full border border-white/15 bg-transparent px-3.5 py-2 text-[13px] text-[#edf3ff] placeholder:text-[#a8b5d5]"
        />
        <button
          type="submit"
          aria-label={copy.chat.send}
          disabled={sending || draft.trim() === ''}
          className="grid size-9 place-items-center rounded-full bg-[#355cff] text-white disabled:opacity-50"
        >
          <Send aria-hidden="true" className="size-4 rtl:-scale-x-100" />
        </button>
      </form>
    </aside>
  )
}
