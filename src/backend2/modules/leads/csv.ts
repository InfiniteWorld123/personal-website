/**
 * A small, strict CSV reader for Lead imports.
 *
 * RFC 4180: quoted fields, doubled quotes inside them, and line breaks inside
 * quotes. The separator is whichever of comma, semicolon or tab appears most
 * in the header line — a spreadsheet saved in Germany writes semicolons. A
 * byte-order mark is dropped. No dependency: the import only ever needs this.
 */

export type ParsedCsv = { header: string[]; rows: string[][] }

const SEPARATORS = [',', ';', '\t'] as const

const pickSeparator = (text: string): string => {
  const firstLine = text.split(/\r?\n/u, 1)[0] ?? ''
  let best: string = ','
  let bestCount = -1

  for (const separator of SEPARATORS) {
    let count = 0
    let quoted = false

    for (const char of firstLine) {
      if (char === '"') quoted = !quoted
      else if (!quoted && char === separator) count += 1
    }

    if (count > bestCount) {
      best = separator
      bestCount = count
    }
  }

  return best
}

export const parseCsv = (input: string): ParsedCsv => {
  const text = input.replace(/^﻿/u, '')
  const separator = pickSeparator(text)
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  let index = 0

  while (index < text.length) {
    const char = text[index]!

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 2
          continue
        }

        quoted = false
        index += 1
        continue
      }

      field += char
      index += 1
      continue
    }

    if (char === '"' && field === '') {
      quoted = true
      index += 1
      continue
    }

    if (char === separator) {
      record.push(field)
      field = ''
      index += 1
      continue
    }

    if (char === '\r' || char === '\n') {
      record.push(field)
      records.push(record)
      record = []
      field = ''
      index += char === '\r' && text[index + 1] === '\n' ? 2 : 1
      continue
    }

    field += char
    index += 1
  }

  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }

  // Blank lines — often at the end of a file — are not rows.
  const nonEmpty = records.filter((cells) => cells.some((cell) => cell.trim() !== ''))
  const [header = [], ...rows] = nonEmpty

  return { header: header.map((cell) => cell.trim()), rows }
}

/**
 * A cell that a spreadsheet would run as a formula, made inert for the report.
 * A phone number such as `+49 170 1234567` is left alone: it holds nothing a
 * spreadsheet could run, and an apostrophe in front of it would be a change.
 */
const guard = (cell: string): string => {
  if (/^[+-][\d\s().\/-]*$/u.test(cell)) return cell

  return /^[=+\-@\t\r]/u.test(cell) ? `'${cell}` : cell
}

/** Writes rows back out as CSV, for the rejection report. */
export const writeCsv = (rows: string[][]): string =>
  `${rows
    .map((cells) =>
      cells
        .map((cell) => {
          const safe = guard(cell)

          return /[",;\r\n]/u.test(safe) ? `"${safe.replace(/"/gu, '""')}"` : safe
        })
        .join(','),
    )
    .join('\r\n')}\r\n`
