import { useCallback, useEffect, useRef, useState } from 'react'
import type { CallCopy } from './call-copy'

/**
 * The camera and the microphone, before and during the call.
 *
 * Owned here rather than inside the connection on purpose: a person should see
 * themselves, pick the right microphone and find their camera already blocked
 * *before* anyone is watching. By the time the call starts, the awkward part
 * is over.
 *
 * Devices may be changed while nobody is connected. Once the call is running
 * the tracks are being sent, and swapping the device under them means
 * renegotiating mid-sentence; muting does not, so muting is what the call
 * offers.
 */

export type MediaStatus = 'starting' | 'ready' | 'failed'

export type MediaDevice = { id: string; label: string }

export type Media = {
  status: MediaStatus
  error: string | null
  stream: MediaStream | null
  cameras: MediaDevice[]
  microphones: MediaDevice[]
  cameraId: string | null
  microphoneId: string | null
  cameraOn: boolean
  microphoneOn: boolean
  choose: (kind: 'camera' | 'microphone', deviceId: string) => void
  toggleCamera: () => void
  toggleMicrophone: () => void
  stop: () => void
}

const constraintsFor = (cameraId: string | null, microphoneId: string | null): MediaStreamConstraints => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    ...(microphoneId ? { deviceId: { exact: microphoneId } } : {}),
  },
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
  },
})

const messageFor = (error: unknown, copy: CallCopy): string => {
  const name = (error as { name?: string } | null)?.name

  if (name === 'NotAllowedError' || name === 'SecurityError') return copy.errors.denied
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return copy.errors.noDevice
  if (name === 'NotReadableError') return copy.errors.inUse

  return copy.errors.generic
}

export const useMedia = (copy: CallCopy): Media => {
  const [status, setStatus] = useState<MediaStatus>('starting')
  const [error, setError] = useState<string | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [cameras, setCameras] = useState<MediaDevice[]>([])
  const [microphones, setMicrophones] = useState<MediaDevice[]>([])
  const [cameraId, setCameraId] = useState<string | null>(null)
  const [microphoneId, setMicrophoneId] = useState<string | null>(null)
  const [cameraOn, setCameraOn] = useState(true)
  const [microphoneOn, setMicrophoneOn] = useState(true)

  const streamRef = useRef<MediaStream | null>(null)
  const stoppedRef = useRef(false)

  /**
   * Labels are blank until permission has been given at least once, which is
   * why the list is read after the first stream rather than before it. A
   * picker reading "Device 1, Device 2" is not a picker.
   */
  const readDevices = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const named = (kind: MediaDeviceKind, fallback: string) =>
      devices
        .filter((device) => device.kind === kind && device.deviceId)
        .map((device, index) => ({
          id: device.deviceId,
          label: device.label || `${fallback} ${index + 1}`,
        }))

    setCameras(named('videoinput', 'Camera'))
    setMicrophones(named('audioinput', 'Microphone'))
  }, [])

  const open = useCallback(
    async (nextCamera: string | null, nextMicrophone: string | null) => {
      try {
        const next = await navigator.mediaDevices.getUserMedia(constraintsFor(nextCamera, nextMicrophone))

        if (stoppedRef.current) {
          next.getTracks().forEach((track) => track.stop())

          return
        }

        // The old stream is stopped only once the new one exists. Stopping
        // first and failing leaves the person with no camera and a picker that
        // looks like it worked.
        streamRef.current?.getTracks().forEach((track) => track.stop())
        streamRef.current = next

        next.getVideoTracks().forEach((track) => (track.enabled = cameraOn))
        next.getAudioTracks().forEach((track) => (track.enabled = microphoneOn))

        setStream(next)
        setCameraId(next.getVideoTracks()[0]?.getSettings().deviceId ?? nextCamera)
        setMicrophoneId(next.getAudioTracks()[0]?.getSettings().deviceId ?? nextMicrophone)
        setStatus('ready')
        setError(null)

        await readDevices()
      } catch (mediaError) {
        if (stoppedRef.current) return

        setError(messageFor(mediaError, copy))
        setStatus('failed')
      }
    },
    [cameraOn, copy, microphoneOn, readDevices],
  )

  useEffect(() => {
    stoppedRef.current = false
    void open(null, null)

    return () => {
      stoppedRef.current = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    // Deliberately once. `open` closes over the toggles, and re-running on a
    // toggle would reopen the camera every time somebody muted themselves.
  }, [])

  const choose = useCallback(
    (kind: 'camera' | 'microphone', deviceId: string) => {
      void open(
        kind === 'camera' ? deviceId : cameraId,
        kind === 'microphone' ? deviceId : microphoneId,
      )
    },
    [cameraId, microphoneId, open],
  )

  /**
   * Muting disables the track rather than removing it. The connection carries
   * on sending an empty track, so nothing has to be renegotiated and the other
   * side's picture does not stutter when somebody clears their throat.
   */
  const toggleCamera = useCallback(() => {
    setCameraOn((on) => {
      streamRef.current?.getVideoTracks().forEach((track) => (track.enabled = !on))

      return !on
    })
  }, [])

  const toggleMicrophone = useCallback(() => {
    setMicrophoneOn((on) => {
      streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !on))

      return !on
    })
  }, [])

  const stop = useCallback(() => {
    stoppedRef.current = true
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
  }, [])

  return {
    status,
    error,
    stream,
    cameras,
    microphones,
    cameraId,
    microphoneId,
    cameraOn,
    microphoneOn,
    choose,
    toggleCamera,
    toggleMicrophone,
    stop,
  }
}
