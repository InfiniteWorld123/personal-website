import 'dotenv/config'

import { sendDueReminders } from '../modules/booking/appointment.service'
import { closePool, readDatabaseUrl } from './client'

/**
 * `bun run db2:booking:send-reminders`.
 *
 * Sends every visitor reminder whose time has come, once each, through the
 * Inbox. It exists for a scheduler to call — a Cloudflare Cron Trigger once one
 * is deployed, every few minutes — and for trying the flow by hand. Running it
 * twice at once sends each reminder once: every appointment is claimed before
 * its email goes.
 *
 * Sending is fake unless `INBOX_SEND_MODE=live`, like every Inbox email.
 */

if (import.meta.main) {
  try {
    readDatabaseUrl()

    const { sent, failed } = await sendDueReminders()

    console.log(`Booking reminders checked. ${sent} sent${failed > 0 ? `, ${failed} failed (see each appointment's history)` : ''}.`)

    if (failed > 0) process.exitCode = 1
  } finally {
    await closePool()
  }
}
