import { useEffect, useRef, useState } from 'react'
import {
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  MonitorUp,
  PhoneOff,
  Send,
  Video,
  VideoOff,
  X,
} from 'lucide-react'
import type { CallAccess } from '#/shared/types/call.types'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { cn } from '#/frontend/lib/utils'
import type { CallCopy } from './call-copy'
import { useCall } from './use-call'
import { useMedia } from './use-media'

/**
 * The room.
 *
 * It sits **inside the site** — his header above it, his colours around it —
 * rather than swallowing the screen. A client who books a call should spend
 * that call looking at something with his name on it; a black rectangle could
 * belong to anyone. When the call needs the room and not the site, the
 * enlarge button gives it the whole screen and the button gives it back.
 *
 * Alone in the room, the person sees themselves, and no clock. A counter
 * counting down is the one thing that makes four minutes feel like twenty.
 *
 * Everything typed here dies with the call. That is not an omission; it is the
 * promise `docs/decisions.md` D33 makes in order to have a call at all.
 */

/**
 * Attaches a stream to a video element.
 *
 * `srcObject` is a property, not an attribute, so React cannot set it from
 * JSX — a `src` holding a `MediaStream` silently shows nothing at all.
 */
const useStream = (stream: MediaStream | null) => {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    element.srcObject = stream

    return () => {
      element.srcObject = null
    }
  }, [stream])

  return ref
}

type RoomProps = {
  copy: CallCopy
  access: CallAccess | null
  joining: boolean
  joinError: string | null
  onJoin: () => void
  onClose: () => void
}

export function CallRoom({ copy, access, joining, joinError, onJoin, onClose }: RoomProps) {
  const media = useMedia(copy)
  const call = useCall(access, media.stream, copy)

  if (!access) {
    return (
      <Lobby
        copy={copy}
        media={media}
        joining={joining}
        error={joinError ?? media.error}
        onJoin={onJoin}
      />
    )
  }

  return (
    <Stage
      copy={copy}
      call={call}
      media={media}
      onClose={() => {
        call.hangUp()
        media.stop()
        onClose()
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Before the call                                                            */
/* -------------------------------------------------------------------------- */

function Lobby({
  copy,
  media,
  joining,
  error,
  onJoin,
}: {
  copy: CallCopy
  media: ReturnType<typeof useMedia>
  joining: boolean
  error: string | null
  onJoin: () => void
}) {
  const videoRef = useStream(media.stream)
  const showing = media.stream !== null && media.cameraOn

  return (
    <div className="mx-auto w-full max-w-xl">
      <h2 className="text-xl font-semibold">{copy.lobby.title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{copy.lobby.subtitle}</p>

      <div className="relative mt-6 overflow-hidden rounded-2xl border bg-neutral-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          /* Mirrored, because a preview that does not mirror makes people
             reach the wrong way when they straighten their collar. */
          className={cn('aspect-video w-full scale-x-[-1] object-cover', showing ? '' : 'invisible')}
        />

        {/* A black rectangle explains nothing. Whenever there is no picture,
            the box itself says which of the three reasons it is. */}
        {showing ? null : (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-neutral-400">
            {media.status === 'starting'
              ? copy.lobby.checking
              : media.status === 'failed'
                ? copy.lobby.noCamera
                : copy.lobby.cameraOff}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <LabelledToggle
          on={media.microphoneOn}
          onLabel={copy.controls.mute}
          offLabel={copy.controls.unmute}
          OnIcon={Mic}
          OffIcon={MicOff}
          onClick={media.toggleMicrophone}
        />
        <LabelledToggle
          on={media.cameraOn}
          onLabel={copy.controls.cameraOff}
          offLabel={copy.controls.cameraOn}
          OnIcon={Video}
          OffIcon={VideoOff}
          onClick={media.toggleCamera}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Picker
          label={copy.lobby.camera}
          devices={media.cameras}
          value={media.cameraId}
          onChange={(id) => media.choose('camera', id)}
        />
        <Picker
          label={copy.lobby.microphone}
          devices={media.microphones}
          value={media.microphoneId}
          onChange={(id) => media.choose('microphone', id)}
        />
      </div>

      {error ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button className="mt-6 w-full sm:w-auto" disabled={joining} onClick={onJoin}>
        {joining ? copy.lobby.joining : copy.lobby.join}
      </Button>
    </div>
  )
}

/**
 * A plain `select`, not the styled one.
 *
 * The device list changes while the page is open — a headset is plugged in, a
 * phone rotates — and the native control is the one that copes with a list
 * being rewritten underneath it without losing the open menu.
 */
function Picker({
  label,
  devices,
  value,
  onChange,
}: {
  label: string
  devices: { id: string; label: string }[]
  value: string | null
  onChange: (id: string) => void
}) {
  const id = `call-device-${label}`

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
        value={value ?? ''}
        disabled={devices.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {devices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* During the call                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The whole screen, and the way back.
 *
 * Native fullscreen is what a person means by the button, and Escape is how
 * they expect to leave it — but Safari on an iPhone refuses it on anything
 * that is not a `<video>`, so the room also lays itself over the page with
 * ordinary CSS. Either way the button reads the same, because the state is
 * this component's and fullscreen only follows it.
 */
const useTheatre = (frame: React.RefObject<HTMLDivElement | null>) => {
  const [theatre, setTheatre] = useState(false)

  useEffect(() => {
    const element = frame.current
    if (!element) return

    if (theatre && !document.fullscreenElement) {
      void element.requestFullscreen?.().catch(() => {
        // Refused. The CSS overlay is already doing the work.
      })
    }
    if (!theatre && document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {})
    }
  }, [frame, theatre])

  useEffect(() => {
    // Escape out of native fullscreen has to bring the room back with it,
    // or the page is left covered by an overlay nothing can close.
    const sync = () => {
      if (!document.fullscreenElement) setTheatre(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTheatre(false)
    }

    document.addEventListener('fullscreenchange', sync)
    window.addEventListener('keydown', escape)

    return () => {
      document.removeEventListener('fullscreenchange', sync)
      window.removeEventListener('keydown', escape)
    }
  }, [])

  return { theatre, toggle: () => setTheatre((on) => !on) }
}

function Stage({
  copy,
  call,
  media,
  onClose,
}: {
  copy: CallCopy
  call: ReturnType<typeof useCall>
  media: ReturnType<typeof useMedia>
  onClose: () => void
}) {
  const [chatOpen, setChatOpen] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)
  const { theatre, toggle } = useTheatre(frameRef)

  const remoteRef = useStream(call.remoteStream)
  const selfLargeRef = useStream(media.stream)
  const selfInsetRef = useStream(media.stream)

  const connected = call.status === 'connected'
  const over = call.status === 'ended' || call.status === 'failed'
  const selfShowing = media.stream !== null && media.cameraOn && !call.sharing
  const peer = call.peerName || copy.people.other

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Announced, not drawn. The frame already carries this sentence in
          larger type and with the other person's name in it; printing it twice
          asks the reader which of the two to believe. */}
      <p className="sr-only" role="status" aria-live="polite">
        {call.error ?? copy.status[call.status]}
      </p>

      {/* The frame owns the shape; the picture fills it. The drawer is a row
          of this column, not a sheet over it, so opening the messages shrinks
          the picture instead of burying the button that ends the call. */}
      <div
        ref={frameRef}
        className={cn(
          'relative flex flex-col overflow-hidden bg-neutral-900',
          theatre ? 'fixed inset-0 z-50 h-dvh rounded-none' : 'aspect-video rounded-2xl border',
        )}
      >
        <div className="relative min-h-0 flex-1">
        {/* The other person, once there is one. */}
        <video
          ref={remoteRef}
          autoPlay
          playsInline
          className={cn(
            'absolute inset-0 size-full bg-neutral-900 object-contain',
            connected ? '' : 'invisible',
          )}
        />

        {/* Alone in the room: your own picture, full frame, and no clock. */}
        {connected ? null : (
          <>
            <video
              ref={selfLargeRef}
              autoPlay
              playsInline
              muted
              className={cn(
                'absolute inset-0 size-full scale-x-[-1] object-cover',
                selfShowing ? '' : 'invisible',
              )}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-t from-black/80 via-black/20 to-black/10 px-6 text-center">
              <p className="text-lg font-medium text-white">
                {call.error ??
                  (call.status === 'waiting'
                    ? copy.waitingFor.replace('{name}', peer)
                    : copy.status[call.status])}
              </p>
              {call.status === 'waiting' && !call.error ? (
                <p className="mt-2 max-w-sm text-sm text-white/70">{copy.waitingSub}</p>
              ) : null}
            </div>
          </>
        )}

        {connected ? (
          <p className="absolute bottom-3 start-3 rounded-md bg-black/65 px-2.5 py-1 text-xs font-medium text-white">
            {peer}
            {call.peerSharing ? ` — ${copy.people.sharing}` : ''}
          </p>
        ) : null}

        {/* The self view, inset, only once there is someone to be inset from.
            Never audible: a speaker playing back your own microphone is a howl. */}
        {connected ? (
          <div className="absolute end-3 top-3 w-28 overflow-hidden rounded-xl bg-neutral-800 shadow-lg sm:w-40">
            <video
              ref={selfInsetRef}
              autoPlay
              playsInline
              muted
              className={cn(
                'aspect-video w-full scale-x-[-1] object-cover',
                selfShowing ? '' : 'invisible',
              )}
            />
            {selfShowing ? null : (
              <p className="absolute inset-0 flex items-center justify-center text-[11px] text-neutral-400">
                {copy.people.you}
              </p>
            )}
          </div>
        ) : null}

        <ControlPill
          copy={copy}
          call={call}
          media={media}
          theatre={theatre}
          chatOpen={chatOpen}
          onToggleTheatre={toggle}
          onToggleChat={() => setChatOpen((open) => !open)}
          onClose={onClose}
          over={over}
        />
        </div>

        {chatOpen ? (
          <ChatDrawer copy={copy} call={call} peer={peer} onClose={() => setChatOpen(false)} />
        ) : null}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function ControlPill({
  copy,
  call,
  media,
  theatre,
  chatOpen,
  onToggleTheatre,
  onToggleChat,
  onClose,
  over,
}: {
  copy: CallCopy
  call: ReturnType<typeof useCall>
  media: ReturnType<typeof useMedia>
  theatre: boolean
  chatOpen: boolean
  onToggleTheatre: () => void
  onToggleChat: () => void
  onClose: () => void
  over: boolean
}) {
  return (
    <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 p-1.5 backdrop-blur-sm sm:gap-2 sm:p-2">
      <RoundToggle
        on={media.microphoneOn}
        onLabel={copy.controls.mute}
        offLabel={copy.controls.unmute}
        OnIcon={Mic}
        OffIcon={MicOff}
        onClick={media.toggleMicrophone}
      />
      <RoundToggle
        on={media.cameraOn}
        onLabel={copy.controls.cameraOff}
        offLabel={copy.controls.cameraOn}
        OnIcon={Video}
        OffIcon={VideoOff}
        onClick={media.toggleCamera}
      />
      <RoundButton
        label={call.sharing ? copy.controls.stopSharing : copy.controls.share}
        pressed={call.sharing}
        Icon={MonitorUp}
        onClick={call.toggleSharing}
      />
      <RoundButton
        label={copy.controls.chat}
        pressed={chatOpen}
        Icon={MessageSquare}
        onClick={onToggleChat}
      />
      <RoundButton
        label={theatre ? copy.controls.shrink : copy.controls.enlarge}
        pressed={theatre}
        Icon={theatre ? Minimize2 : Maximize2}
        onClick={onToggleTheatre}
      />
      <RoundButton
        label={over ? copy.leave : copy.controls.leave}
        Icon={PhoneOff}
        onClick={onClose}
        danger
      />
    </div>
  )
}

/**
 * A drawer, not a column.
 *
 * A side panel narrows the picture for the whole call to hold two lines that
 * are read once. This covers the bottom of the frame only while it is open,
 * and gives every pixel back the moment it closes.
 */
function ChatDrawer({
  copy,
  call,
  peer,
  onClose,
}: {
  copy: CallCopy
  call: ReturnType<typeof useCall>
  peer: string
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // `auto`, not `smooth`: a message arriving mid-scroll should not animate,
    // and an animation here would have to answer to reduced motion.
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
  }, [call.messages])

  return (
    <section className="flex max-h-[55%] shrink-0 flex-col rounded-t-2xl bg-background motion-safe:animate-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h3 className="text-sm font-medium">{copy.chat.title}</h3>
        <button
          type="button"
          aria-label={copy.controls.closeChat}
          className="rounded-md p-1 text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {call.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.chat.empty}</p>
        ) : (
          call.messages.map((message) => (
            <p key={message.id} className="text-sm">
              <span className="font-medium">{message.mine ? copy.chat.you : peer}</span>
              <span className="text-muted-foreground">: </span>
              <span className="break-words">{message.text}</span>
            </p>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form
        className="flex items-center gap-2 border-t px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault()
          call.say(draft)
          setDraft('')
        }}
      >
        <Input
          value={draft}
          placeholder={copy.chat.placeholder}
          aria-label={copy.chat.placeholder}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" size="icon" aria-label={copy.chat.send} disabled={draft.trim() === ''}>
          <Send aria-hidden className="size-4" />
        </Button>
      </form>

      <p className="px-4 pb-3 text-xs text-muted-foreground">{copy.chat.notice}</p>
    </section>
  )
}

/* -------------------------------------------------------------------------- */

const ROUND =
  'flex size-10 items-center justify-center rounded-full text-white transition-colors disabled:opacity-50'

function RoundButton({
  label,
  Icon,
  onClick,
  pressed,
  danger,
}: {
  label: string
  Icon: typeof Mic
  onClick: () => void
  pressed?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      /* Icon-only, so the name is carried by the label rather than drawn.
         Without it the whole bar is unreadable to a screen reader. */
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        ROUND,
        danger
          ? 'bg-red-600 hover:bg-red-700'
          : pressed
            ? 'bg-white/90 text-neutral-900 hover:bg-white'
            : 'bg-white/15 hover:bg-white/25',
      )}
      onClick={onClick}
    >
      <Icon aria-hidden className="size-[18px]" />
    </button>
  )
}

/** Off is the loud state: a muted microphone must not look like a live one. */
function RoundToggle({
  on,
  onLabel,
  offLabel,
  OnIcon,
  OffIcon,
  onClick,
}: {
  on: boolean
  onLabel: string
  offLabel: string
  OnIcon: typeof Mic
  OffIcon: typeof MicOff
  onClick: () => void
}) {
  const Icon = on ? OnIcon : OffIcon

  return (
    <button
      type="button"
      aria-label={on ? onLabel : offLabel}
      title={on ? onLabel : offLabel}
      aria-pressed={!on}
      className={cn(ROUND, on ? 'bg-white/15 hover:bg-white/25' : 'bg-red-600 hover:bg-red-700')}
      onClick={onClick}
    >
      <Icon aria-hidden className="size-[18px]" />
    </button>
  )
}

function LabelledToggle({
  on,
  onLabel,
  offLabel,
  OnIcon,
  OffIcon,
  onClick,
}: {
  on: boolean
  onLabel: string
  offLabel: string
  OnIcon: typeof Mic
  OffIcon: typeof MicOff
  onClick: () => void
}) {
  const Icon = on ? OnIcon : OffIcon

  return (
    <Button
      type="button"
      variant={on ? 'outline' : 'secondary'}
      size="sm"
      aria-pressed={!on}
      onClick={onClick}
    >
      <Icon aria-hidden className="size-4" />
      {on ? onLabel : offLabel}
    </Button>
  )
}
