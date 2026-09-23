import {
  OWNER_EARLY_JOIN_MINUTES,
  VIDEO_JOIN_GRACE_MINUTES,
  type VideoAccess,
  type VideoPreflight,
} from '../../contracts/booking.contract'
import { withTransaction } from '../../db/client'
import { conflict, notFound, notVideo, providerUnavailable, videoClosed, videoNotOpen } from '../../http/error'
import { authoriseVisitor } from './appointment.service'
import * as repo from './booking.repo'
import { addMinutes } from './booking.time'
import { VideoUnavailableError, resolveVideoProvider } from './booking.video'

/**
 * Who may enter the room, and when. Backend2 decides; the provider only
 * carries the media.
 *
 *  - One confirmed Video appointment, one meeting, two identities: the owner
 *    and the visitor. A second visitor tab gets the same visitor identity back,
 *    never a third seat.
 *  - The visitor may open their link any time to test camera and microphone,
 *    but receives a media token only from the scheduled start.
 *  - Nobody new may join after the scheduled end plus one hour, or after the
 *    owner ended the room. A call already running is never cut off.
 */

const timing = (row: repo.AppointmentRow) => {
  const startsAt = new Date(row.starts_at)
  const endsAt = new Date(row.ends_at)

  return { startsAt, endsAt, joinClosesAt: addMinutes(endsAt, VIDEO_JOIN_GRACE_MINUTES) }
}

const stateOf = (row: repo.AppointmentRow, now: Date): VideoPreflight['state'] => {
  const { startsAt, joinClosesAt } = timing(row)

  if (row.status === 'cancelled') return 'cancelled'
  if (row.video_ended_at) return 'ended'
  if (now > joinClosesAt || row.status !== 'confirmed') return 'closed'
  if (now < startsAt) return 'early'

  return 'open'
}

const asAccess = (row: repo.AppointmentRow, token: string, role: 'host' | 'guest'): VideoAccess => {
  const { startsAt, endsAt, joinClosesAt } = timing(row)

  return {
    token,
    role,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    joinClosesAt: joinClosesAt.toISOString(),
  }
}

/** The waiting screen's facts. No token, ever. */
export const visitorPreflight = async (
  input: { reference: string; token: string },
  now: Date = new Date(),
): Promise<VideoPreflight> => {
  const row = await authoriseVisitor(input.reference, input.token)

  if (row.method !== 'video') throw notVideo()

  const { startsAt, endsAt, joinClosesAt } = timing(row)

  return {
    state: stateOf(row, now),
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    joinClosesAt: joinClosesAt.toISOString(),
    serverTime: now.toISOString(),
  }
}

/**
 * Issues one participant's token, creating the meeting and the participant
 * the first time. Runs under the appointment's row lock, so two tabs pressing
 * Join together cannot create two meetings or a third seat.
 */
const issue = async (id: string, role: 'host' | 'guest', name: string): Promise<VideoAccess> =>
  withTransaction(async () => {
    const row = (await repo.lockAppointment(id))!
    const provider = resolveVideoProvider()

    try {
      let meetingId = row.video_meeting_id

      if (!meetingId) {
        meetingId = (await provider.createMeeting({ title: `${row.type_name} · ${row.reference}` })).meetingId
        await repo.updateAppointment(row.id, { video_meeting_id: meetingId })
      }

      const column = role === 'host' ? 'video_host_participant' : 'video_guest_participant'
      const existing = role === 'host' ? row.video_host_participant : row.video_guest_participant
      const issued = await provider.participantToken({ meetingId, participantId: existing, role, name })

      if (!existing) await repo.updateAppointment(row.id, { [column]: issued.participantId })

      return asAccess(row, issued.token, role)
    } catch (error) {
      if (error instanceof VideoUnavailableError) throw providerUnavailable()

      throw error
    }
  })

export const visitorJoin = async (input: { reference: string; token: string }, now: Date = new Date()): Promise<VideoAccess> => {
  const row = await authoriseVisitor(input.reference, input.token)

  if (row.method !== 'video') throw notVideo()

  const state = stateOf(row, now)

  if (state === 'early') throw videoNotOpen(undefined, { startsAt: new Date(row.starts_at).toISOString() })
  if (state !== 'open') throw videoClosed()

  return issue(row.id, 'guest', row.visitor_name)
}

export const ownerJoin = async (id: string, now: Date = new Date()): Promise<VideoAccess> => {
  const row = await repo.findAppointment(id)

  if (!row) throw notFound('That appointment does not exist')
  if (row.method !== 'video') throw notVideo()

  const { startsAt, joinClosesAt } = timing(row)

  if (row.status !== 'confirmed' || row.video_ended_at || now > joinClosesAt) throw videoClosed()
  if (now < addMinutes(startsAt, -OWNER_EARLY_JOIN_MINUTES)) {
    throw videoNotOpen(`The room opens ${OWNER_EARLY_JOIN_MINUTES} minutes before the start.`, {
      startsAt: startsAt.toISOString(),
    })
  }

  return issue(row.id, 'host', 'Yaman Warda')
}

/** The owner closes the room. Nobody can join it again. */
export const ownerEnd = async (id: string, now: Date = new Date()): Promise<{ endedAt: string }> => {
  const meetingId = await withTransaction(async () => {
    const row = await repo.lockAppointment(id)

    if (!row) throw notFound('That appointment does not exist')
    if (row.method !== 'video') throw notVideo()
    if (row.video_ended_at) throw conflict('This call has already ended.')

    await repo.updateAppointment(row.id, { video_ended_at: now })
    await repo.addHistory({ appointmentId: row.id, actor: 'owner', kind: 'video_ended', details: {} })

    return row.video_meeting_id
  })

  if (meetingId) await resolveVideoProvider().endMeeting(meetingId).catch(() => {})

  return { endedAt: now.toISOString() }
}
