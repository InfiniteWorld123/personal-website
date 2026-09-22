import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/server'
import { readAuthConfig } from './config'
import { fromBase64Url, toBase64Url } from './crypto'

/**
 * WebAuthn, through `@simplewebauthn/server`.
 *
 * The verification is the library's — signature checking, CBOR and COSE
 * parsing, attestation formats. What this file owns is the policy
 * `docs/v2/auth.md` insists on:
 *
 *  - **User verification is required and re-checked.** Asking for it in the
 *    options is a request the authenticator may ignore; the flag in the signed
 *    authenticator data is the fact. Both registration and authentication
 *    refuse a response whose `userVerified` is false, which is what makes
 *    "no password and no TOTP afterwards" safe.
 *  - **Discoverable credentials.** `residentKey: 'required'` means the owner
 *    presses one button and the browser offers the passkey, with no email
 *    typed first. It also means the sign-in ceremony reveals nothing: the
 *    challenge is issued before anyone is identified, so it cannot confirm
 *    that an account exists.
 *  - **Origin and RP ID are checked against configuration**, never against
 *    something the request said about itself.
 */

export type StoredCredential = {
  credentialId: string
  publicKey: Uint8Array<ArrayBuffer>
  counter: number
  transports: string[]
}

/**
 * The WebAuthn user handle.
 *
 * There is exactly one owner, and the handle is stored inside the
 * authenticator for ever, so it must not be an email address — changing the
 * login email would otherwise orphan every registered passkey. A constant
 * derived from the owner's row id keeps the two independent.
 */
const userHandle = (ownerId: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(ownerId)

export const buildRegistrationOptions = async (options: {
  ownerId: string
  email: string
  existing: Array<{ credentialId: string; transports: string[] }>
}) => {
  const config = readAuthConfig()

  return generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpId,
    userID: userHandle(options.ownerId),
    userName: options.email,
    userDisplayName: config.rpName,
    attestationType: 'none',
    // Registering the same authenticator twice produces a second row that
    // looks like a second device and is not one.
    excludeCredentials: options.existing.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
  })
}

export type RegistrationVerification =
  | { ok: false; reason: string }
  | {
      ok: true
      credentialId: string
      publicKey: Uint8Array<ArrayBuffer>
      counter: number
      transports: string[]
      deviceType: 'singleDevice' | 'multiDevice'
      backedUp: boolean
    }

export const verifyRegistration = async (options: {
  response: RegistrationResponseJSON
  expectedChallenge: string
}): Promise<RegistrationVerification> => {
  const config = readAuthConfig()

  let verification

  try {
    verification = await verifyRegistrationResponse({
      response: options.response,
      expectedChallenge: options.expectedChallenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpId,
      requireUserVerification: true,
    })
  } catch (error) {
    // A malformed or mismatched response throws. It is a refusal, not a fault:
    // the library's message can mention the origin it expected, so it is
    // never passed on to the client.
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown' }
  }

  if (!verification.verified || !verification.registrationInfo) {
    return { ok: false, reason: 'not verified' }
  }

  const info = verification.registrationInfo

  // The library was asked to require it; this asserts it actually happened,
  // because the passwordless route depends on it and nothing else does.
  if (!info.userVerified) return { ok: false, reason: 'user verification missing' }

  return {
    ok: true,
    credentialId: info.credential.id,
    publicKey: info.credential.publicKey,
    counter: info.credential.counter,
    // Optional chaining, because a credential that reached here is still a
    // body the client sent: a missing `response` must be a refusal, not a 500.
    transports: (options.response.response?.transports ?? []) as string[],
    deviceType: info.credentialDeviceType,
    backedUp: info.credentialBackedUp,
  }
}

/**
 * The sign-in ceremony.
 *
 * `allowCredentials` is deliberately left empty. Listing the owner's
 * credentials would answer "does this account exist?" to anyone who asked, and
 * with discoverable credentials the browser does not need the list anyway.
 */
export const buildAuthenticationOptions = async () => {
  const config = readAuthConfig()

  return generateAuthenticationOptions({
    rpID: config.rpId,
    userVerification: 'required',
  })
}

export type AuthenticationVerification =
  | { ok: false; reason: string }
  | { ok: true; credentialId: string; newCounter: number; backedUp: boolean }

export const verifyAuthentication = async (options: {
  response: AuthenticationResponseJSON
  expectedChallenge: string
  credential: StoredCredential
}): Promise<AuthenticationVerification> => {
  const config = readAuthConfig()

  let verification

  try {
    verification = await verifyAuthenticationResponse({
      response: options.response,
      expectedChallenge: options.expectedChallenge,
      expectedOrigin: config.origins,
      expectedRPID: config.rpId,
      requireUserVerification: true,
      credential: {
        id: options.credential.credentialId,
        publicKey: options.credential.publicKey,
        counter: options.credential.counter,
        transports: options.credential.transports as AuthenticatorTransportFuture[],
      },
    })
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'unknown' }
  }

  if (!verification.verified) return { ok: false, reason: 'not verified' }
  if (!verification.authenticationInfo.userVerified) {
    return { ok: false, reason: 'user verification missing' }
  }

  return {
    ok: true,
    credentialId: verification.authenticationInfo.credentialID,
    newCounter: verification.authenticationInfo.newCounter,
    backedUp: verification.authenticationInfo.credentialBackedUp,
  }
}

/**
 * The credential id the browser sent, normalised.
 *
 * Read from the response rather than trusted as a lookup key on its own: it
 * only selects which stored public key to check the signature against, and a
 * wrong guess fails that check.
 */
export const credentialIdFrom = (response: { id?: unknown; rawId?: unknown }): string | null => {
  const value = typeof response.id === 'string' ? response.id : response.rawId

  return typeof value === 'string' && value.length > 0 && value.length <= 512 ? value : null
}

export { fromBase64Url, toBase64Url }
