import 'dotenv/config'

import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { recordSecurityEvent } from '../auth/audit'
import { AUTH_LIMITS, EmailSchema, PasswordSchema } from '../contracts/auth.contract'
import { hashPassword } from '../auth/crypto'
import { createOwner, findOwner } from '../modules/auth/owner.repo'
import { closePool, readDatabaseUrl } from './client'
import { runV2Migrations } from './migrate'

/**
 * The one-time local setup that creates the single V2 owner.
 *
 * `docs/v2/auth.md` is explicit that this is "a restricted local, one-time
 * setup; there is no public sign-up". So it is a CLI and not a route: there is
 * nothing here for the internet to reach, and no code path anywhere else in
 * Backend2 can create an owner.
 *
 * Three rules it keeps:
 *
 *  - **The password is never an argument.** A command-line argument is in the
 *    process list, in the shell history and in any crash report. It is typed
 *    at a prompt with echo off, and it is hashed before it is anywhere else.
 *  - **It refuses to overwrite.** A second run on a database that already has
 *    an owner stops, rather than resetting the account somebody is using.
 *  - **It grants nothing.** The account it creates has a password and no
 *    second factor, so the first sign-in reaches enrollment — not the
 *    Dashboard.
 */

/**
 * Reads a line with the terminal's echo turned off.
 *
 * `readline` has no hidden-input mode, so the `keypress` write that would
 * print the character is intercepted. The `finally` puts the terminal back
 * however the read ended, including on Ctrl-C.
 */
const readHidden = async (prompt: string): Promise<string> => {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true })
  const output = stdout as NodeJS.WriteStream & { muted?: boolean }
  const write = output.write.bind(output)

  ;(rl as unknown as { output: NodeJS.WriteStream }).output.write = ((chunk: string) =>
    output.muted ? true : write(chunk)) as typeof write

  try {
    const answer = rl.question(prompt)

    output.muted = true

    const value = await answer

    return value
  } finally {
    output.muted = false
    write('\n')
    rl.close()
  }
}

const readVisible = async (prompt: string): Promise<string> => {
  const rl = createInterface({ input: stdin, output: stdout })

  try {
    return (await rl.question(prompt)).trim()
  } finally {
    rl.close()
  }
}

const fail = (message: string): never => {
  console.error(`\n✗ ${message}\n`)
  process.exit(1)
}

export const bootstrapOwner = async (): Promise<void> => {
  // Throws when DATABASE_URL_V2 is missing, or is the legacy database.
  readDatabaseUrl()

  // The owner tables have to exist before a row can go in one.
  await runV2Migrations()

  if (await findOwner()) {
    fail(
      'This database already has a V2 owner. Setup refuses to overwrite it.\n' +
        '  To recover a locked-out account, follow the emergency runbook in docs/v2/auth.md.',
    )
  }

  console.log('\nV2 owner setup — this runs once, against the V2 database only.')
  console.log('The legacy /admin account is untouched; the same address is fine here.\n')

  const rawEmail = await readVisible('Email address: ')
  const email = (() => {
    const result = EmailSchema['~run']({ value: rawEmail }, {})

    if (result.issues) fail('That email address is not valid.')

    return result.value as string
  })()

  const password = await readHidden(
    `Password (at least ${AUTH_LIMITS.passwordMin} characters, not shown): `,
  )
  const confirmation = await readHidden('Repeat it: ')

  if (password !== confirmation) fail('Those did not match. Nothing was written.')

  const check = PasswordSchema['~run']({ value: password }, {})

  if (check.issues) fail(check.issues[0]?.message ?? 'That password is not acceptable.')

  const owner = await createOwner({ email, passwordHash: await hashPassword(password) })

  await recordSecurityEvent({ ownerId: owner.id, kind: 'owner_created' })

  console.log(`\n✓ Owner created for ${email}.`)
  console.log('\nNext, and required before this account can reach anything:')
  console.log('  1. Sign in once with the email and password.')
  console.log('  2. Set up your authenticator app when prompted, and save the recovery codes.')
  console.log('  3. Register a passkey per device under Settings → Security.')
  console.log('\nUntil step 2 is finished the account is in enrollment and has no access.\n')
}

if (import.meta.main) {
  try {
    await bootstrapOwner()
  } finally {
    await closePool()
  }
}
