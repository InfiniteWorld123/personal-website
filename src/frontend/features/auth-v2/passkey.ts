import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'

/**
 * The browser half of WebAuthn.
 *
 * `@simplewebauthn/browser` does the base64url encoding and the
 * `navigator.credentials` call; what this file adds is the distinction the
 * sign-in screen actually needs — a prompt the owner dismissed is not an
 * error, and must not be shown as one.
 *
 * Nothing here ever sees a fingerprint. The device checks the person and
 * returns a signature; that is the whole of what reaches the page.
 */

export type PasskeyOutcome<T> =
  | { status: 'ok'; credential: T }
  | { status: 'cancelled' }
  | { status: 'unsupported' }
  | { status: 'failed'; message: string }

/** Whether the button should be offered at all. */
export const supportsPasskeys = (): boolean => browserSupportsWebAuthn()

/**
 * Whether the device has a built-in authenticator — Touch ID, Windows Hello,
 * a phone's own lock. Used only to choose wording, never to block the button:
 * a security key plugged into a machine with no platform authenticator is a
 * perfectly good passkey.
 */
export const hasDeviceAuthenticator = async (): Promise<boolean> => {
  try {
    return await platformAuthenticatorIsAvailable()
  } catch {
    return false
  }
}

/**
 * The two ways a ceremony ends badly are told apart by the DOM error name.
 *
 * `NotAllowedError` is what the browser reports both when the person closed
 * the sheet and when it timed out. Neither is a failure worth a red banner —
 * the fallback is right there on the screen.
 */
const classify = (error: unknown): PasskeyOutcome<never> => {
  const name = (error as { name?: string })?.name

  if (name === 'NotAllowedError' || name === 'AbortError') return { status: 'cancelled' }
  if (name === 'NotSupportedError') return { status: 'unsupported' }

  return {
    status: 'failed',
    message: 'That passkey could not be used. Try again, or use your password.',
  }
}

export const requestPasskeyAssertion = async (
  options: Record<string, unknown>,
): Promise<PasskeyOutcome<unknown>> => {
  if (!supportsPasskeys()) return { status: 'unsupported' }

  try {
    return { status: 'ok', credential: await startAuthentication({ optionsJSON: options as never }) }
  } catch (error) {
    return classify(error)
  }
}

export const requestPasskeyRegistration = async (
  options: Record<string, unknown>,
): Promise<PasskeyOutcome<unknown>> => {
  if (!supportsPasskeys()) return { status: 'unsupported' }

  try {
    return { status: 'ok', credential: await startRegistration({ optionsJSON: options as never }) }
  } catch (error) {
    // Registering a credential the account already holds throws this one, and
    // "you already added this device" is more use than "it could not be used".
    if ((error as { name?: string })?.name === 'InvalidStateError') {
      return { status: 'failed', message: 'This device already has a passkey for this account.' }
    }

    return classify(error)
  }
}

/**
 * A name for a new passkey, guessed from the browser so the field starts with
 * something rather than empty. The owner can type over it, and the server
 * takes whatever it is given.
 */
export const guessDeviceName = (): string => {
  if (typeof navigator === 'undefined') return 'This device'

  const ua = navigator.userAgent.toLowerCase()

  if (ua.includes('iphone')) return 'iPhone'
  if (ua.includes('ipad')) return 'iPad'
  if (ua.includes('android')) return 'Android phone'
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'Mac'
  if (ua.includes('windows')) return 'Windows PC'
  if (ua.includes('linux')) return 'Linux PC'

  return 'This device'
}
