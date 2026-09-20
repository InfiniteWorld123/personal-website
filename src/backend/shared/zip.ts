/**
 * A ZIP file, written by hand.
 *
 * Forty lines of format instead of a dependency, for three reasons worth
 * naming:
 *
 *   1. **Nothing here needs compressing.** Every file this archive carries is
 *      a PDF, and a PDF is already compressed — running deflate over one buys
 *      a percent or two and costs CPU on a Worker that is billed for it. So
 *      every entry is stored, method `0`, and the "compressor" is a copy.
 *   2. **A ZIP writer is a format, not an algorithm.** Store-only ZIP is four
 *      structures laid end to end, all documented in APPNOTE.TXT, and it is
 *      read by every operating system without anything installed. The library
 *      that would replace this is mostly the deflate we do not want.
 *   3. It is the one file he will hand to a Steuerberater, so it has to work
 *      in Windows Explorer opened by somebody who will not debug it.
 *
 * Deliberately **not** streaming. Everything is assembled in memory, which is
 * correct for what this is used for — a year of a one-person business is a
 * few megabytes — and streaming would mean computing sizes and CRCs ahead of
 * the data or using data descriptors, both of which are more format for no
 * gain at this size.
 */

/* -------------------------------------------------------------------------- */
/* CRC-32                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The checksum every ZIP entry carries, over the uncompressed bytes.
 *
 * A reader that finds it wrong reports the archive as corrupt, so this is not
 * decoration — get it wrong and every file appears damaged.
 *
 * The table is built once on first use rather than written out as 256
 * constants nobody can check.
 */
let CRC_TABLE: Uint32Array | null = null

const crcTable = (): Uint32Array => {
  if (CRC_TABLE) return CRC_TABLE

  const table = new Uint32Array(256)

  for (let index = 0; index < 256; index += 1) {
    let value = index

    for (let bit = 0; bit < 8; bit += 1) {
      // `0xEDB88320` — the reversed CRC-32 polynomial, the one ZIP, PNG and
      // gzip all use. Pinned by a known-answer test, because a wrong constant
      // here produces an archive every reader calls corrupt.
      value = value & 1 ? (0xedb88320 ^ (value >>> 1)) >>> 0 : value >>> 1
    }

    table[index] = value >>> 0
  }

  CRC_TABLE = table

  return table
}

export const crc32 = (bytes: Uint8Array): number => {
  const table = crcTable()
  let crc = 0xffffffff

  for (let index = 0; index < bytes.length; index += 1) {
    crc = table[(crc ^ bytes[index]!) & 0xff]! ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

/* -------------------------------------------------------------------------- */
/* The archive                                                                */
/* -------------------------------------------------------------------------- */

export type ZipEntry = {
  /** The path inside the archive. Kept to ASCII by the caller. */
  name: string
  bytes: Uint8Array
}

/**
 * MS-DOS time and date, which is what ZIP stores.
 *
 * Two-second resolution and a year counted from 1980, because the format is
 * from 1989 and never grew a second field. A wrong value here is cosmetic —
 * the file still opens — but a plausible one keeps the archive from looking
 * broken in a file manager's date column.
 */
const dosStamp = (at: Date): { time: number; date: number } => ({
  time: (at.getHours() << 11) | (at.getMinutes() << 5) | Math.floor(at.getSeconds() / 2),
  date: ((at.getFullYear() - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate(),
})

/** Little-endian writers, because every field in a ZIP is little-endian. */
const u16 = (view: DataView, at: number, value: number) => view.setUint16(at, value, true)
const u32 = (view: DataView, at: number, value: number) => view.setUint32(at, value, true)

export const zip = (entries: ZipEntry[], at: Date = new Date()): Uint8Array => {
  const encoder = new TextEncoder()
  const stamp = dosStamp(at)

  const prepared = entries.map((entry) => ({
    name: encoder.encode(entry.name),
    bytes: entry.bytes,
    crc: crc32(entry.bytes),
  }))

  const localSize = prepared.reduce((sum, e) => sum + 30 + e.name.length + e.bytes.length, 0)
  const centralSize = prepared.reduce((sum, e) => sum + 46 + e.name.length, 0)

  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)

  let offset = 0
  const offsets: number[] = []

  /* ── One local header and its data, per file ─────────────────────────── */

  for (const entry of prepared) {
    offsets.push(offset)

    u32(view, offset, 0x04034b50) // local file header signature
    u16(view, offset + 4, 20) // version needed: 2.0
    u16(view, offset + 6, 0) // flags: none. Names are ASCII, so no UTF-8 bit.
    u16(view, offset + 8, 0) // method 0 — stored
    u16(view, offset + 10, stamp.time)
    u16(view, offset + 12, stamp.date)
    u32(view, offset + 14, entry.crc)
    u32(view, offset + 18, entry.bytes.length) // compressed size
    u32(view, offset + 22, entry.bytes.length) // uncompressed size
    u16(view, offset + 26, entry.name.length)
    u16(view, offset + 28, 0) // extra field length

    out.set(entry.name, offset + 30)
    out.set(entry.bytes, offset + 30 + entry.name.length)

    offset += 30 + entry.name.length + entry.bytes.length
  }

  /* ── The central directory: the index a reader actually opens ────────── */

  const centralStart = offset

  prepared.forEach((entry, index) => {
    u32(view, offset, 0x02014b50) // central directory header signature
    u16(view, offset + 4, 20) // version made by
    u16(view, offset + 6, 20) // version needed
    u16(view, offset + 8, 0)
    u16(view, offset + 10, 0) // stored
    u16(view, offset + 12, stamp.time)
    u16(view, offset + 14, stamp.date)
    u32(view, offset + 16, entry.crc)
    u32(view, offset + 20, entry.bytes.length)
    u32(view, offset + 24, entry.bytes.length)
    u16(view, offset + 28, entry.name.length)
    u16(view, offset + 30, 0) // extra
    u16(view, offset + 32, 0) // comment
    u16(view, offset + 34, 0) // disk number
    u16(view, offset + 36, 0) // internal attributes
    u32(view, offset + 38, 0) // external attributes
    u32(view, offset + 42, offsets[index]!) // where its local header sits

    out.set(entry.name, offset + 46)

    offset += 46 + entry.name.length
  })

  /* ── End of central directory ────────────────────────────────────────── */

  u32(view, offset, 0x06054b50)
  u16(view, offset + 4, 0) // this disk
  u16(view, offset + 6, 0) // disk where the directory starts
  u16(view, offset + 8, prepared.length)
  u16(view, offset + 10, prepared.length)
  u32(view, offset + 12, offset - centralStart)
  u32(view, offset + 16, centralStart)
  u16(view, offset + 20, 0) // comment length

  return out
}
