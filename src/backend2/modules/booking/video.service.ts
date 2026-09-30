import { VIDEO_JOIN_GRACE_MINUTES, type VideoPreflight } from '../../contracts/booking.contract'
import { notVideo } from '../../http/error'
import { authoriseVisitor } from './appointment.service'
import type * as repo from './booking.repo'
import { addMinutes } from './booking.time'
import { fixedMeetingLink } from './booking.video'

/**
 * The visitor's call page. Video appointments meet in the owner's fixed
 * Google Meet room (`BOOKING_MEET_LINK`); this only tells the page where the
 * appointment stands and where the room is. The in-site video call
 * was removed on 1 Oct 2026 — see "Future: our own video system" in
 * `docs/v2/booking.md`.
 *
 *  - `early` before the start, `open` from the start until one hour after
 *    the end, `closed` after that or once it is no longer confirmed.
 *  - `ended` for older appointments whose in-site room the owner closed.
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

/** The call page's facts. */
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
    meetLink: fixedMeetingLink(),
  }
}
