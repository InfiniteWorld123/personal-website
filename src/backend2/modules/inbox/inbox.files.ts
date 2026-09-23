import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { ACCEPTED_CONTENT_TYPES, PROBE_BYTES } from '../../contracts/media.contract'
import { INGRESS_MAX_FILE_BYTES } from '../../contracts/inbox.contract'
import { probeMedia } from '../../media/probe'
import type { MediaStore } from '../../media/store'
import * as mediaRepo from '../media/media.repo'

/**
 * Files that arrive with an email.
 *
 * The first files in V2 that did not come off the owner's own computer, so
 * the rules are stricter than an upload's in one direction and looser in
 * another. Stricter: anything that can run — a program, a script, a web page,
 * a macro-enabled Office file — is refused outright, bytes not kept. Looser: a
 * file the server does not recognise but that cannot run (a calendar invite,
 * a HEIC photo) is still kept, privately, for download — dropping it would
 * lose part of a client's letter.
 *
 * Nothing here decides whether a file may enter the Media library. That is
 * `ACCEPTED_CONTENT_TYPES`, checked again by the Media upload itself when the
 * owner explicitly chooses Save to Media.
 */

/** Control characters, separators and Windows-reserved punctuation. */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME = /[\u0000-\u001f\u007f<>:"/\\|?*]/gu

export const sanitizeIncomingName = (name: string): string => {
  const cleaned = (name.split(/[/\\]/u).pop() ?? '')
    .replace(UNSAFE_NAME, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^\.+/u, '')
    .slice(0, 200)
    .trim()

  return cleaned === '' ? 'attachment' : cleaned
}

/**
 * Extensions that name something executable or active. Refused whatever the
 * bytes say, because the owner's computer decides what to do with a file by
 * its name, not by its contents.
 */
const BLOCKED_EXTENSIONS = new Set([
  'exe', 'dll', 'com', 'bat', 'cmd', 'scr', 'pif', 'cpl', 'msi', 'msp', 'mst', 'msc',
  'js', 'jse', 'mjs', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'psd1', 'sh', 'bash', 'zsh',
  'csh', 'command', 'app', 'jar', 'apk', 'ipa', 'dmg', 'pkg', 'deb', 'rpm', 'run',
  'html', 'htm', 'xhtml', 'shtml', 'hta', 'mht', 'mhtml', 'svgz',
  'lnk', 'url', 'webloc', 'reg', 'inf', 'scf', 'gadget', 'application', 'appref-ms',
  'iso', 'img', 'vhd', 'vhdx',
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'ppsm', 'sldm', 'xll',
  'py', 'pyw', 'rb', 'pl', 'php', 'asp', 'aspx', 'jsp', 'cgi',
])

const startsWith = (bytes: Uint8Array, signature: number[]): boolean =>
  bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)

/** Headers of programs and active documents, found whatever the name claims. */
const looksExecutable = (head: Uint8Array): boolean => {
  if (startsWith(head, [0x4d, 0x5a])) return true // Windows PE ("MZ")
  if (startsWith(head, [0x7f, 0x45, 0x4c, 0x46])) return true // ELF
  if (startsWith(head, [0xcf, 0xfa, 0xed, 0xfe])) return true // Mach-O 64
  if (startsWith(head, [0xce, 0xfa, 0xed, 0xfe])) return true // Mach-O 32
  if (startsWith(head, [0xca, 0xfe, 0xba, 0xbe])) return true // Mach-O universal / Java class
  if (startsWith(head, [0x23, 0x21])) return true // "#!" script

  const text = new TextDecoder('latin1')
    .decode(head.subarray(0, Math.min(head.length, 1024)))
    .toLowerCase()
    .trimStart()

  return /^(<!doctype html|<html|<script|<\?php|<hta:)/u.test(text)
}

const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.')

  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export type ClassifiedFile =
  | { status: 'blocked'; fileName: string; declaredType: string; byteSize: number; reason: string }
  | { status: 'failed'; fileName: string; declaredType: string; byteSize: number; reason: string }
  | {
      status: 'accept'
      fileName: string
      declaredType: string
      byteSize: number
      bytes: Uint8Array
      /** Null when the bytes are not a type the server recognises. */
      detectedType: string | null
      checksum: string
    }

/** Base64 as the Worker sends it, decoded strictly. */
const decodeBase64 = (value: string): Uint8Array | null => {
  try {
    const binary = atob(value.replace(/\s+/gu, ''))
    const bytes = new Uint8Array(binary.length)

    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)

    return bytes
  } catch {
    return null
  }
}

export const classifyIncomingFile = (file: {
  filename: string
  contentType: string
  content: string
}): ClassifiedFile => {
  const fileName = sanitizeIncomingName(file.filename)
  const declaredType = file.contentType.slice(0, 120)
  const bytes = decodeBase64(file.content)

  if (!bytes) {
    return { status: 'failed', fileName, declaredType, byteSize: 0, reason: 'The file could not be read.' }
  }

  const base = { fileName, declaredType, byteSize: bytes.byteLength }

  if (bytes.byteLength === 0) return { status: 'failed', ...base, reason: 'The file was empty.' }

  if (bytes.byteLength > INGRESS_MAX_FILE_BYTES) {
    return { status: 'failed', ...base, reason: 'The file is larger than 10 MB and was not kept.' }
  }

  if (BLOCKED_EXTENSIONS.has(extensionOf(fileName)) || looksExecutable(bytes)) {
    return {
      status: 'blocked',
      ...base,
      reason: 'Blocked for safety: this kind of file can run code. It was not kept.',
    }
  }

  const probe = probeMedia(bytes.subarray(0, PROBE_BYTES), fileName)

  return {
    status: 'accept',
    ...base,
    bytes,
    detectedType: probe?.contentType ?? null,
    checksum: bytesToHex(sha256(bytes)),
  }
}

/** Whether Media would take a file of this detected type. */
export const mediaAcceptsType = (detectedType: string | null): boolean =>
  detectedType !== null && ACCEPTED_CONTENT_TYPES.includes(detectedType)

export const inboxStorageKey = (now: Date = new Date()): string => {
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')

  return `inbox/${now.getUTCFullYear()}/${month}/${crypto.randomUUID()}.bin`
}

/**
 * Writes the bytes, recording the key first so a crash between the write and
 * the database row leaves something the Media sweep knows to remove.
 */
export const storeIncomingBytes = async (input: {
  store: MediaStore
  bytes: Uint8Array
}): Promise<string> => {
  const key = inboxStorageKey()

  await mediaRepo.markPendingObject({ storageKey: key, purpose: 'upload' })

  try {
    await input.store.put({
      key,
      body: input.bytes,
      contentType: 'application/octet-stream',
      size: input.bytes.byteLength,
    })
  } catch (error) {
    await input.store.remove(key).catch(() => {})
    await mediaRepo.clearPendingObject(key).catch(() => {})

    throw error
  }

  return key
}
