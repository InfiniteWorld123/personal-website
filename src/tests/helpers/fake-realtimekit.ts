/**
 * A stand-in for `@cloudflare/realtimekit` in tests: just enough of the
 * client for the call screen — people, their media flags, chat, and the
 * events that move them — driven by the test instead of a network.
 *
 *   vi.mock('@cloudflare/realtimekit', () => fakeRealtimeKitModule())
 *   const call = lastFakeCall()
 *   call.addPerson({ id: 'p1', name: 'Dana' })
 */

type Handler = (...args: any[]) => void

class Emitter {
  private handlers = new Map<string, Set<Handler>>()

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)

    return this
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler)

    return this
  }

  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }
}

const track = (kind: string) => ({ kind, id: `${kind}-${Math.random()}` }) as unknown as MediaStreamTrack

export class FakePerson {
  audioEnabled = true
  videoEnabled = true
  screenShareEnabled = false
  audioTrack = track('audio')
  videoTrack = track('video')
  screenShareTracks: { audio?: MediaStreamTrack; video?: MediaStreamTrack } = {}
  registered = new Set<HTMLVideoElement>()

  constructor(
    public id: string,
    public name: string,
  ) {}

  registerVideoElement(element: HTMLVideoElement) {
    this.registered.add(element)
  }

  deregisterVideoElement(element: HTMLVideoElement) {
    this.registered.delete(element)
  }
}

class FakeSelf extends Emitter {
  userId = 'self-user'
  name = 'Me'
  roomJoined = false
  audioEnabled = true
  videoEnabled = true
  screenShareEnabled = false
  registered = new Set<HTMLVideoElement>()

  registerVideoElement(element: HTMLVideoElement) {
    this.registered.add(element)
  }

  deregisterVideoElement(element: HTMLVideoElement) {
    this.registered.delete(element)
  }

  async disableAudio() {
    this.audioEnabled = false
    this.emit('audioUpdate', { audioEnabled: false })
  }

  async enableAudio() {
    this.audioEnabled = true
    this.emit('audioUpdate', { audioEnabled: true })
  }

  async disableVideo() {
    this.videoEnabled = false
    this.emit('videoUpdate', { videoEnabled: false })
  }

  async enableVideo() {
    this.videoEnabled = true
    this.emit('videoUpdate', { videoEnabled: true })
  }

  async enableScreenShare() {
    this.screenShareEnabled = true
    this.emit('screenShareUpdate', { screenShareEnabled: true, screenShareTracks: {} })
  }

  async disableScreenShare() {
    this.screenShareEnabled = false
    this.emit('screenShareUpdate', { screenShareEnabled: false, screenShareTracks: {} })
  }
}

class FakeJoined extends Emitter {
  people = new Map<string, FakePerson>()

  toArray() {
    return [...this.people.values()]
  }

  get(id: string) {
    return this.people.get(id)
  }
}

class FakeChat extends Emitter {
  sent: string[] = []

  async sendTextMessage(text: string) {
    this.sent.push(text)
    this.emit('chatUpdate', {
      action: 'add',
      message: { type: 'text', id: `m-${this.sent.length}`, userId: 'self-user', displayName: 'Me', message: text, time: new Date() },
      messages: [],
    })
  }
}

export class FakeCall {
  self = new FakeSelf()
  participants = { joined: new FakeJoined() }
  chat = new FakeChat()
  joined = false
  left = false

  constructor(public token: string) {}

  async join() {
    this.joined = true
    this.self.roomJoined = true
  }

  async leave() {
    this.left = true
    this.self.roomJoined = false
  }

  /** The other person arrives, with camera and microphone on. */
  addPerson(input: { id: string; name: string }) {
    const person = new FakePerson(input.id, input.name)

    this.participants.joined.people.set(person.id, person)
    this.participants.joined.emit('participantJoined', person)

    return person
  }

  removePerson(id: string) {
    const person = this.participants.joined.people.get(id)

    this.participants.joined.people.delete(id)
    this.participants.joined.emit('participantLeft', person)
  }

  setAudio(id: string, audioEnabled: boolean) {
    const person = this.participants.joined.people.get(id)!

    person.audioEnabled = audioEnabled
    this.participants.joined.emit('audioUpdate', { id, audioEnabled, audioTrack: person.audioTrack })
  }

  /** The other person writes in the chat. */
  receive(text: string, from = 'Dana') {
    this.chat.emit('chatUpdate', {
      action: 'add',
      message: { type: 'text', id: `r-${Math.random()}`, userId: 'other-user', displayName: from, message: text, time: new Date() },
      messages: [],
    })
  }

  /** The room closes on this person: `kicked` when the owner ends the call. */
  removed(state: 'kicked' | 'ended' | 'disconnected' | 'failed' = 'kicked') {
    this.self.roomJoined = false
    this.self.emit('roomLeft', { state })
  }
}

const calls: FakeCall[] = []
let refuseNext = false

export const lastFakeCall = (): FakeCall => {
  const call = calls.at(-1)

  if (!call) throw new Error('No call was opened')

  return call
}

export const fakeCalls = (): readonly FakeCall[] => calls

/** The next `init` fails, as with an expired token or no network. */
export const refuseNextFakeCall = () => {
  refuseNext = true
}

export const resetFakeCalls = () => {
  calls.length = 0
  refuseNext = false
}

export const fakeRealtimeKitModule = () => ({
  default: {
    init: async ({ authToken }: { authToken: string }) => {
      if (refuseNext) {
        refuseNext = false
        throw new Error('Invalid token')
      }

      const call = new FakeCall(authToken)

      calls.push(call)

      return call
    },
  },
})

/** jsdom has no WebRTC: a MediaStream that only counts its tracks, and an audio element that plays. */
export const installFakeMedia = (options: { autoplayBlocked?: boolean } = {}) => {
  class FakeMediaStream {
    tracks: MediaStreamTrack[]

    constructor(tracks: MediaStreamTrack[] = []) {
      this.tracks = [...tracks]
    }

    addTrack(track: MediaStreamTrack) {
      this.tracks.push(track)
    }

    removeTrack(track: MediaStreamTrack) {
      this.tracks = this.tracks.filter((item) => item !== track)
    }

    getTracks() {
      return this.tracks
    }

    getAudioTracks() {
      return this.tracks.filter((item) => item.kind === 'audio')
    }

    getVideoTracks() {
      return this.tracks.filter((item) => item.kind === 'video')
    }
  }

  const state = { blocked: Boolean(options.autoplayBlocked), plays: 0 }

  Object.assign(globalThis, { MediaStream: FakeMediaStream })
  Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, writable: true, value: null })
  HTMLMediaElement.prototype.play = function play() {
    state.plays += 1

    if (state.blocked) {
      const error = new Error('blocked')

      error.name = 'NotAllowedError'

      return Promise.reject(error)
    }

    return Promise.resolve()
  }
  HTMLMediaElement.prototype.pause = () => {}

  return state
}
