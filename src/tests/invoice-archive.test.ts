import { describe, expect, it } from 'vitest'
import { crc32, zip } from '#/backend/shared/zip'

/**
 * The one file he will hand to a Steuerberater.
 *
 * Everything he has lives in one Cloudflare account — the documents in a
 * bucket, the figures in a database beside it — and German retention law asks
 * *him* for the invoices, not his hosting. The archive is how a copy gets
 * out, so it has to open in Windows Explorer on a machine that has nothing
 * installed and belongs to somebody who will not debug it.
 *
 * That makes the format itself load-bearing. A wrong CRC constant or a
 * mis-placed offset produces a file every reader calls corrupt — and the
 * moment anyone would notice is the year he actually needs it.
 */

const bytes = (text: string) => new TextEncoder().encode(text)

/* -------------------------------------------------------------------------- */
/* The checksum                                                               */
/* -------------------------------------------------------------------------- */

describe('crc32', () => {
  it('matches the values the standard publishes', () => {
    /*
     * Known answers, which is the only honest way to test a checksum: an
     * implementation compared against itself passes while being wrong.
     * `123456789` is the check value every CRC-32 reference states.
     */
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
    expect(crc32(bytes('a'))).toBe(0xe8b7be43)
    expect(crc32(bytes(''))).toBe(0)
  })

  it('changes when a single byte changes', () => {
    expect(crc32(bytes('Rechnung 2026-001'))).not.toBe(crc32(bytes('Rechnung 2026-002')))
  })

  it('stays inside an unsigned 32-bit range', () => {
    // A sign bit that leaked through would be written as a negative number
    // into a field that has no sign, and the entry would read as damaged.
    for (const text of ['', 'a', '123456789', 'ü'.repeat(500)]) {
      const value = crc32(bytes(text))

      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(0xffffffff)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* The archive                                                                */
/* -------------------------------------------------------------------------- */

/** Little-endian readers, to check the structures the writer laid down. */
const u16 = (data: Uint8Array, at: number) => new DataView(data.buffer).getUint16(at, true)
const u32 = (data: Uint8Array, at: number) => new DataView(data.buffer).getUint32(at, true)

const AT = new Date('2026-09-20T14:30:00Z')

describe('the archive a Steuerberater opens', () => {
  it('starts with a local file header, so a reader knows what it is', () => {
    const archive = zip([{ name: 'Rechnungen.csv', bytes: bytes('Nummer;Brutto') }], AT)

    expect(u32(archive, 0)).toBe(0x04034b50)
    // Method 0 — stored. Every file inside is a PDF, which is already
    // compressed; deflating one buys a percent and costs Worker CPU.
    expect(u16(archive, 8)).toBe(0)
  })

  it('ends with the central directory a reader actually indexes from', () => {
    const archive = zip(
      [
        { name: '2026-001-Rechnung.pdf', bytes: bytes('%PDF-1.7 one') },
        { name: '2026-002-Stornorechnung.pdf', bytes: bytes('%PDF-1.7 two') },
      ],
      AT,
    )

    const end = archive.length - 22

    expect(u32(archive, end)).toBe(0x06054b50)
    expect(u16(archive, end + 8)).toBe(2)
    expect(u16(archive, end + 10)).toBe(2)

    // The directory has to start where the end record says it does, or a
    // reader looks for the index in the middle of a PDF.
    const start = u32(archive, end + 16)

    expect(u32(archive, start)).toBe(0x02014b50)
    expect(u32(archive, end + 12)).toBe(end - start)
  })

  it('points each directory entry at its own local header', () => {
    const archive = zip(
      [
        { name: 'a.pdf', bytes: bytes('first') },
        { name: 'b.pdf', bytes: bytes('second one, longer') },
        { name: 'c.pdf', bytes: bytes('third') },
      ],
      AT,
    )

    const end = archive.length - 22
    let at = u32(archive, end + 16)

    for (let index = 0; index < 3; index += 1) {
      const nameLength = u16(archive, at + 28)
      const offset = u32(archive, at + 42)

      // Follow the pointer: a local header has to be sitting there.
      expect(u32(archive, offset)).toBe(0x04034b50)
      at += 46 + nameLength
    }
  })

  it('records the real size and checksum of each file, in both places', () => {
    const payload = bytes('%PDF-1.7 a whole invoice, pretend')
    const archive = zip([{ name: '2026-001-Rechnung.pdf', bytes: payload }], AT)

    const nameLength = u16(archive, 26)

    expect(u32(archive, 14)).toBe(crc32(payload))
    expect(u32(archive, 18)).toBe(payload.length)
    expect(u32(archive, 22)).toBe(payload.length)

    // Stored, so the bytes appear verbatim right after the name.
    const data = archive.slice(30 + nameLength, 30 + nameLength + payload.length)

    expect(new TextDecoder().decode(data)).toBe('%PDF-1.7 a whole invoice, pretend')

    // And the directory copy has to agree with the local one, or readers
    // disagree with each other about the same file.
    const start = u32(archive, archive.length - 22 + 16)

    expect(u32(archive, start + 16)).toBe(crc32(payload))
    expect(u32(archive, start + 24)).toBe(payload.length)
  })

  it('carries the names the files are meant to be saved under', () => {
    const archive = zip([{ name: '2026-001-Rechnung.pdf', bytes: bytes('x') }], AT)
    const nameLength = u16(archive, 26)
    const name = new TextDecoder().decode(archive.slice(30, 30 + nameLength))

    expect(name).toBe('2026-001-Rechnung.pdf')
  })

  it('writes a date a file manager can show', () => {
    const archive = zip([{ name: 'a.pdf', bytes: bytes('x') }], new Date('2026-09-20T14:30:00'))

    // MS-DOS date: year counted from 1980, then month, then day.
    const date = u16(archive, 12)

    expect((date >> 9) + 1980).toBe(2026)
    expect((date >> 5) & 0xf).toBe(9)
    expect(date & 0x1f).toBe(20)
  })

  it('builds an empty archive rather than throwing on no files', () => {
    // Not a case the service can reach — it refuses a year with nothing in it
    // and says so in a sentence — but a writer that threw here would turn a
    // recoverable emptiness into a 500.
    const archive = zip([], AT)

    expect(archive.length).toBe(22)
    expect(u32(archive, 0)).toBe(0x06054b50)
  })

  it('lays a real archive out at exactly the size the format requires', () => {
    const files = [
      { name: 'one.pdf', bytes: bytes('a'.repeat(100)) },
      { name: 'two.pdf', bytes: bytes('b'.repeat(250)) },
    ]

    const archive = zip(files, AT)

    const local = files.reduce((sum, f) => sum + 30 + f.name.length + f.bytes.length, 0)
    const central = files.reduce((sum, f) => sum + 46 + f.name.length, 0)

    expect(archive.length).toBe(local + central + 22)
  })
})
