import { useCallback, useEffect, useRef, useState } from 'react'
import type { CallAccess } from '#/shared/types/call.types'
import type { CallCopy } from './call-copy'

/**
 * The call itself.
 *
 * Two browsers that have never met agree on how to send each other video.
 * Each writes a description of what it can do and a list of addresses it might
 * be reachable at; the room Worker carries those few kilobytes between them;
 * and from then on the picture and sound travel directly, touching no server
 * of ours at all.
 *
 * The hard part is not the swap — it is that both sides may try to lead at the
 * same instant, and a connection where both have offered is stuck. The fix is
 * the one the specification calls perfect negotiation: one side is **polite**
 * and, on a collision, withdraws its own offer and accepts the other's, while
 * the impolite side carries on. The room decides which is which and says so in
 * its welcome, so neither client guesses and both cannot choose the same role.
 *
 * The camera is not opened here — `use-media.ts` owns it, and hands the stream
 * over once the person has seen themselves and pressed the button.
 */

export type CallStatus =
  | 'connecting'
  /** In the room, alone. The other chair is empty. */
  | 'waiting'
  /** Both present, still agreeing on a route. */
  | 'negotiating'
  | 'connected'
  | 'ended'
  | 'failed'

export type CallMessage = {
  id: string
  mine: boolean
  text: string
  at: number
}

export type Call = {
  status: CallStatus
  error: string | null
  remoteStream: MediaStream | null
  peerName: string
  /** True while the other side is sending their screen instead of their camera. */
  peerSharing: boolean
  sharing: boolean
  messages: CallMessage[]
  say: (text: string) => void
  toggleSharing: () => void
  hangUp: () => void
}

type RoomMessage =
  | { type: 'welcome'; seat: string; offers: boolean; peer: { name: string } | null }
  | { type: 'peer-joined'; name: string }
  | { type: 'peer-left' }
  | { type: 'peer-absent' }
  | { type: 'description'; description: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'chat'; text: string }
  | { type: 'sharing'; on: boolean }

/** Long enough for a link or an address, short enough not to be a document. */
const MAX_MESSAGE_LENGTH = 2000

export const useCall = (access: CallAccess | null, stream: MediaStream | null, copy: CallCopy): Call => {
  const [status, setStatus] = useState<CallStatus>('connecting')
  const [error, setError] = useState<string | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [peerName, setPeerName] = useState('')
  const [peerSharing, setPeerSharing] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [messages, setMessages] = useState<CallMessage[]>([])

  const socketRef = useRef<WebSocket | null>(null)
  const connectionRef = useRef<RTCPeerConnection | null>(null)
  const screenRef = useRef<MediaStream | null>(null)
  const endedRef = useRef(false)

  /**
   * The local stream, read through a ref so the connection is not torn down
   * and rebuilt when React hands back a new object for the same camera.
   */
  const streamRef = useRef(stream)
  streamRef.current = stream

  const copyRef = useRef(copy)
  copyRef.current = copy

  const send = useCallback((payload: unknown) => {
    const socket = socketRef.current

    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
  }, [])

  const stopScreen = useCallback(() => {
    screenRef.current?.getTracks().forEach((track) => track.stop())
    screenRef.current = null
  }, [])

  const hangUp = useCallback(() => {
    endedRef.current = true

    stopScreen()
    connectionRef.current?.close()
    connectionRef.current = null

    socketRef.current?.close(1000, 'Left the call')
    socketRef.current = null

    setRemoteStream(null)
    setSharing(false)
    setStatus('ended')
  }, [stopScreen])

  /** The sender carrying this side's picture, whatever is feeding it. */
  const videoSender = () =>
    connectionRef.current?.getSenders().find((sender) => sender.track?.kind === 'video') ?? null

  const toggleSharing = useCallback(() => {
    const sender = videoSender()
    if (!sender) return

    if (screenRef.current) {
      const camera = streamRef.current?.getVideoTracks()[0] ?? null

      // `replaceTrack` swaps what is being sent without renegotiating, so the
      // other side sees the picture change rather than the call reconnect.
      void sender.replaceTrack(camera)
      stopScreen()
      setSharing(false)
      send({ type: 'sharing', on: false })

      return
    }

    void (async () => {
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        const track = display.getVideoTracks()[0]
        if (!track) return

        screenRef.current = display
        await sender.replaceTrack(track)
        setSharing(true)
        send({ type: 'sharing', on: true })

        // The browser's own "Stop sharing" bar is outside this page, so the
        // end of a share arrives as a track ending, not as a click.
        track.addEventListener('ended', () => {
          void sender.replaceTrack(streamRef.current?.getVideoTracks()[0] ?? null)
          stopScreen()
          setSharing(false)
          send({ type: 'sharing', on: false })
        })
      } catch {
        // The picker was dismissed. Not an error worth a sentence.
      }
    })()
  }, [send, stopScreen])

  const say = useCallback(
    (text: string) => {
      const trimmed = text.trim().slice(0, MAX_MESSAGE_LENGTH)
      if (trimmed === '') return

      send({ type: 'chat', text: trimmed })
      setMessages((all) => [
        ...all,
        { id: crypto.randomUUID(), mine: true, text: trimmed, at: Date.now() },
      ])
    },
    [send],
  )

  useEffect(() => {
    if (!access) return

    // Survives the double mount React performs in development: the second run
    // must not talk to the first run's socket.
    let cancelled = false
    endedRef.current = false

    /** Set while this side is mid-offer; read to detect a collision. */
    let makingOffer = false
    /** The room's verdict on who leads. Overwritten by the welcome. */
    let polite = true

    let socket: WebSocket | null = null
    let connection: RTCPeerConnection | null = null

    const post = (payload: unknown) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload))
    }

    const fail = (message: string) => {
      if (cancelled || endedRef.current) return
      setError(message)
      setStatus('failed')
    }

    connection = new RTCPeerConnection({ iceServers: access.iceServers })
    connectionRef.current = connection

    // One stream object for the whole call, filled as tracks arrive. A new
    // object per track makes the video element restart and flicker.
    const incoming = new MediaStream()
    setRemoteStream(incoming)

    connection.ontrack = (event) => {
      event.streams[0]?.getTracks().forEach((track) => {
        if (!incoming.getTrackById(track.id)) incoming.addTrack(track)
      })
    }

    connection.onicecandidate = (event) => {
      if (event.candidate) post({ type: 'candidate', candidate: event.candidate.toJSON() })
    }

    connection.onnegotiationneeded = async () => {
      try {
        makingOffer = true
        await connection?.setLocalDescription()
        post({ type: 'description', description: connection?.localDescription })
      } catch {
        // Recovered from by the next negotiation, which the connection
        // schedules itself.
      } finally {
        makingOffer = false
      }
    }

    connection.onconnectionstatechange = () => {
      if (cancelled || endedRef.current) return

      const state = connection?.connectionState

      if (state === 'connected') setStatus('connected')
      if (state === 'failed') fail(copyRef.current.errors.blocked)
    }

    /**
     * Adds the camera and microphone — which is what makes the connection want
     * to negotiate.
     *
     * Deliberately not done when the connection is built. Alone in the room
     * there is nobody to send a description to and the room drops it rather
     * than holding a stale one, so attaching on the peer's arrival means the
     * negotiation begins exactly when there are two people to negotiate.
     */
    const attachLocalTracks = () => {
      const local = streamRef.current
      if (!connection || !local) return
      if (connection.getSenders().length > 0) return

      local.getTracks().forEach((track) => connection?.addTrack(track, local))
    }

    socket = new WebSocket(access.url)
    socketRef.current = socket

    socket.onerror = () => fail(copyRef.current.errors.unreachable)

    socket.onclose = (event) => {
      if (cancelled || endedRef.current) return

      // 4001: the same person opened this call somewhere else. "The connection
      // dropped" would send them hunting for a network fault that is a tab.
      if (event.code === 4001) return fail(copyRef.current.errors.otherTab)
      if (event.code !== 1000) fail(copyRef.current.errors.lost)
    }

    socket.onmessage = async (event) => {
      if (cancelled || endedRef.current || !connection) return

      let message: RoomMessage
      try {
        message = JSON.parse(event.data as string) as RoomMessage
      } catch {
        return
      }

      if (message.type === 'welcome') {
        polite = !message.offers
        setPeerName(message.peer?.name ?? access.peerName)

        if (message.peer) {
          attachLocalTracks()
          setStatus('negotiating')
        } else {
          setStatus('waiting')
        }

        return
      }

      if (message.type === 'peer-joined') {
        setPeerName(message.name || access.peerName)
        attachLocalTracks()
        setStatus('negotiating')

        return
      }

      if (message.type === 'peer-left') {
        incoming.getTracks().forEach((track) => incoming.removeTrack(track))
        setPeerSharing(false)
        setStatus('waiting')

        return
      }

      if (message.type === 'peer-absent') return

      if (message.type === 'sharing') {
        setPeerSharing(Boolean(message.on))

        return
      }

      if (message.type === 'chat') {
        const text = String(message.text ?? '').slice(0, MAX_MESSAGE_LENGTH)
        if (text.trim() === '') return

        setMessages((all) => [
          ...all,
          { id: crypto.randomUUID(), mine: false, text, at: Date.now() },
        ])

        return
      }

      if (message.type === 'description') {
        try {
          const offered = message.description.type === 'offer'
          const collision = offered && (makingOffer || connection.signalingState !== 'stable')

          if (!polite && collision) return

          await connection.setRemoteDescription(message.description)

          if (offered) {
            await connection.setLocalDescription()
            post({ type: 'description', description: connection.localDescription })
          }
        } catch {
          // Same reasoning as above: the connection renegotiates.
        }

        return
      }

      if (message.type === 'candidate') {
        try {
          await connection.addIceCandidate(message.candidate)
        } catch {
          // A candidate belonging to an offer this side deliberately ignored
          // cannot be added, and that is the correct outcome, not a fault.
        }
      }
    }

    return () => {
      cancelled = true

      screenRef.current?.getTracks().forEach((track) => track.stop())
      screenRef.current = null

      connection?.close()
      if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, 'Left the call')

      connectionRef.current = null
      socketRef.current = null
    }
    // The stream is read through a ref, and the copy through another, so
    // neither restarts a call in progress.
  }, [access])

  return {
    status,
    error,
    remoteStream,
    peerName,
    peerSharing,
    sharing,
    messages,
    say,
    toggleSharing,
    hangUp,
  }
}
