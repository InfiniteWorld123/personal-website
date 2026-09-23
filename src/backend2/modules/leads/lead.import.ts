import * as v from 'valibot'
import { getDb, withTransaction } from '../../db/client'
import { emailKey, phoneKey } from '../../contracts/client.contract'
import { findCountryCode, isCountryCode } from '../../contracts/country.contract'
import {
  type ImportCommitInput,
  type ImportMapping,
  type ImportPreview,
  type ImportPreviewInput,
  type ImportResult,
  type ImportRowVerdict,
  LEAD_IMPORT_LIMITS,
  type LeadFields,
  LeadFieldsSchema,
} from '../../contracts/lead.contract'
import type { Page } from '../../contracts/pagination.contract'
import { notFound, validationFailed } from '../../http/error'
import * as choices from './lead-choice.repo'
import * as repo from './lead.repo'
import { parseCsv, writeCsv } from './csv'

/**
 * CSV import: manual data entry at scale (`docs/v2/leads.md`).
 *
 * Preview first — map columns, see each row's verdict — and nothing is saved.
 * Then one confirmed import, keyed by the browser's idempotency key: valid
 * rows become `New` Leads, invalid ones are reported by row with a reason,
 * and a retry of the same import returns the first result without importing
 * anything twice. The same rules as manual entry apply to every row; a
 * duplicate email or phone — against existing Leads or earlier in the file —
 * is rejected, never merged. No outreach, no Inbox, no Booking.
 */

type Verdict = {
  row: number
  cells: string[]
  fields: LeadFields | null
  reason: string | null
}

const WORDS: Record<keyof ImportMapping, string[]> = {
  name: [
    'name',
    'full name',
    'contact',
    'contact name',
    'kontakt',
    'ansprechpartner',
    'vollständiger name',
  ],
  email: ['email', 'e-mail', 'mail', 'email address', 'e-mail-adresse'],
  phone: [
    'phone',
    'phone number',
    'telephone',
    'tel',
    'telefon',
    'telefonnummer',
    'mobile',
    'handy',
    'mobil',
  ],
  country: ['country', 'land'],
  source: ['source', 'quelle', 'lead source'],
  company: ['company', 'firma', 'unternehmen', 'business', 'company name', 'firmenname'],
  niche: ['niche', 'industry', 'branche', 'category', 'kategorie'],
  notes: ['notes', 'note', 'notizen', 'comment', 'comments', 'kommentar', 'bemerkung'],
}

/** A first guess from the header's words, which the owner then corrects. */
export const suggestMapping = (header: string[]): ImportMapping => {
  const mapping: ImportMapping = {
    name: null,
    email: null,
    phone: null,
    country: null,
    source: null,
    company: null,
    niche: null,
    notes: null,
  }
  const used = new Set<number>()

  for (const field of Object.keys(WORDS) as Array<keyof ImportMapping>) {
    const index = header.findIndex(
      (cell, i) => !used.has(i) && WORDS[field].includes(cell.trim().toLowerCase()),
    )

    if (index >= 0) {
      mapping[field] = index
      used.add(index)
    }
  }

  return mapping
}

const LABEL: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  country: 'Country',
  sourceId: 'Source',
  company: 'Company',
  nicheId: 'Niche',
  notes: 'Notes',
}

const missingFields = (input: {
  mapping: ImportMapping
  countryDefault: string
  sourceDefaultId: string
}): ImportPreview['missing'] => {
  const missing: ImportPreview['missing'] = []

  if (input.mapping.name === null) missing.push('name')
  if (input.mapping.email === null) missing.push('email')
  if (input.mapping.phone === null) missing.push('phone')
  if (input.mapping.country === null && !isCountryCode(input.countryDefault))
    missing.push('country')
  if (input.mapping.source === null && input.sourceDefaultId === '') missing.push('source')

  return missing
}

const readFile = (csv: string) => {
  if (new TextEncoder().encode(csv).byteLength > LEAD_IMPORT_LIMITS.bytes) {
    throw validationFailed('The file is larger than 2 MB. Split it into smaller files.')
  }

  const parsed = parseCsv(csv)

  if (parsed.header.length === 0) throw validationFailed('The file has no header row')
  if (parsed.header.length > LEAD_IMPORT_LIMITS.columns) {
    throw validationFailed(`The file has more than ${LEAD_IMPORT_LIMITS.columns} columns`)
  }
  if (parsed.rows.length > LEAD_IMPORT_LIMITS.rows) {
    throw validationFailed(
      `The file has ${parsed.rows.length.toLocaleString('en')} rows. Import at most ${LEAD_IMPORT_LIMITS.rows.toLocaleString('en')} at a time.`,
    )
  }

  return parsed
}

const nameMap = async (table: 'v2_lead_sources' | 'v2_niches') => {
  const { rows } = await getDb().query<{ id: string; name_key: string; hidden: boolean }>(
    `SELECT id, name_key, hidden FROM ${table}`,
  )

  return new Map(rows.map((row) => [row.name_key, row]))
}

/** Every row's verdict. Reads the database; writes nothing. */
const judge = async (input: {
  rows: string[][]
  mapping: ImportMapping
  countryDefault: string
  sourceDefaultId: string
}): Promise<Verdict[]> => {
  const sources = await nameMap('v2_lead_sources')
  const niches = await nameMap('v2_niches')
  const defaultSource = input.sourceDefaultId
    ? await choices.findChoice('sources', input.sourceDefaultId)
    : null

  if (input.mapping.source === null && (!defaultSource || defaultSource.hidden)) {
    throw validationFailed('Choose a source for these leads', {
      issues: [{ field: 'sourceDefaultId', message: 'Choose a source that is not hidden' }],
      missing: [],
    })
  }

  const cell = (cells: string[], index: number | null) =>
    index === null ? '' : (cells[index] ?? '').trim()

  const firstPass = input.rows.map((cells, index): Verdict => {
    const row = index + 2
    const reject = (reason: string): Verdict => ({ row, cells, fields: null, reason })

    let country = input.countryDefault

    if (input.mapping.country !== null) {
      const raw = cell(cells, input.mapping.country)

      if (raw === '') return reject('Country is missing')

      const code = findCountryCode(raw)

      if (!code) return reject(`Country “${raw}” is not recognised`)

      country = code
    }

    let sourceId = defaultSource?.id ?? ''

    if (input.mapping.source !== null) {
      const raw = cell(cells, input.mapping.source)

      if (raw === '') return reject('Source is missing')

      const found = sources.get(raw.toLowerCase())

      if (!found) return reject(`Source “${raw}” is not in your list`)
      if (found.hidden) return reject(`Source “${raw}” is hidden`)

      sourceId = found.id
    }

    let nicheId: string | null = null
    const nicheText = cell(cells, input.mapping.niche)

    if (nicheText !== '') {
      const found = niches.get(nicheText.toLowerCase())

      if (!found) return reject(`Niche “${nicheText}” is not in your list`)
      if (found.hidden) return reject(`Niche “${nicheText}” is hidden`)

      nicheId = found.id
    }

    const parsed = v.safeParse(LeadFieldsSchema, {
      name: cell(cells, input.mapping.name),
      email: cell(cells, input.mapping.email),
      phone: cell(cells, input.mapping.phone),
      country,
      sourceId,
      company: cell(cells, input.mapping.company),
      nicheId,
      notes: input.mapping.notes === null ? '' : (cells[input.mapping.notes] ?? ''),
    })

    if (!parsed.success) {
      const issue = parsed.issues[0]!
      const field = v.getDotPath(issue) ?? ''

      return reject(`${LABEL[field] ?? 'Row'}: ${issue.message}`)
    }

    return { row, cells, fields: parsed.output, reason: null }
  })

  // Duplicates: against Leads already on file, then earlier in this file.
  const candidates = firstPass.filter((verdict) => verdict.fields)
  const existing = await repo.existingKeys(
    candidates.map((verdict) => emailKey(verdict.fields!.email)),
    candidates.map((verdict) => phoneKey(verdict.fields!.phone)),
  )
  const seenEmail = new Map<string, number>()
  const seenPhone = new Map<string, number>()

  return firstPass.map((verdict) => {
    if (!verdict.fields) return verdict

    const email = emailKey(verdict.fields.email)
    const phone = phoneKey(verdict.fields.phone)
    const reject = (reason: string): Verdict => ({ ...verdict, fields: null, reason })

    if (existing.emails.has(email)) return reject('A lead with this email already exists')
    if (existing.phones.has(phone)) return reject('A lead with this phone already exists')
    if (seenEmail.has(email)) return reject(`Same email as row ${seenEmail.get(email)}`)
    if (seenPhone.has(phone)) return reject(`Same phone as row ${seenPhone.get(phone)}`)

    seenEmail.set(email, verdict.row)
    seenPhone.set(phone, verdict.row)

    return verdict
  })
}

const raw = (cells: string[], index: number | null): string =>
  index === null ? '' : (cells[index] ?? '').trim().slice(0, 200)

/** The file, mapped and judged. Saves nothing. */
export const previewImport = async (input: ImportPreviewInput): Promise<ImportPreview> => {
  await withTransaction(() => choices.ensureDefaults())

  const file = readFile(input.csv)
  const mapping = input.mapping ?? suggestMapping(file.header)
  const defaults = {
    countryDefault: input.countryDefault ?? '',
    sourceDefaultId: input.sourceDefaultId ?? '',
  }
  const missing = missingFields({ mapping, ...defaults })

  if (missing.length > 0) {
    return {
      header: file.header,
      mapping,
      missing,
      totalRows: file.rows.length,
      accepted: 0,
      rejected: 0,
      rows: [],
      rejections: [],
    }
  }

  const verdicts = await judge({ rows: file.rows, mapping, ...defaults })
  const rejected = verdicts.filter((verdict) => verdict.reason)

  return {
    header: file.header,
    mapping,
    missing,
    totalRows: verdicts.length,
    accepted: verdicts.length - rejected.length,
    rejected: rejected.length,
    rows: verdicts.slice(0, LEAD_IMPORT_LIMITS.previewRows).map((verdict): ImportRowVerdict => ({
      row: verdict.row,
      accepted: verdict.reason === null,
      reason: verdict.reason,
      // A skipped row still says who it was, as the file wrote it.
      lead: verdict.fields
        ? {
            name: verdict.fields.name,
            email: verdict.fields.email,
            phone: verdict.fields.phone,
            country: verdict.fields.country,
            source: '',
          }
        : {
            name: raw(verdict.cells, mapping.name),
            email: raw(verdict.cells, mapping.email),
            phone: raw(verdict.cells, mapping.phone),
            country: raw(verdict.cells, mapping.country),
            source: raw(verdict.cells, mapping.source),
          },
    })),
    rejections: rejected
      .slice(0, 50)
      .map((verdict) => ({ row: verdict.row, reason: verdict.reason! })),
  }
}

type ImportRow = {
  id: string
  file_name: string
  header: string[]
  total_rows: number
  accepted_rows: number
  rejected_rows: number
  created_at: Date
}

const toResult = (row: ImportRow): ImportResult => ({
  id: row.id,
  fileName: row.file_name,
  totalRows: row.total_rows,
  accepted: row.accepted_rows,
  rejected: row.rejected_rows,
  createdAt: new Date(row.created_at).toISOString(),
})

const BATCH = 500

/** The confirmed import. Idempotent by key; all or nothing. */
export const commitImport = async (input: ImportCommitInput): Promise<ImportResult> =>
  withTransaction(async () => {
    const db = getDb()

    await choices.ensureDefaults()
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('v2_lead_imports:' || $1))`, [
      input.idempotencyKey,
    ])

    const { rows: earlier } = await db.query<ImportRow>(
      'SELECT * FROM v2_lead_imports WHERE idempotency_key = $1',
      [input.idempotencyKey],
    )

    if (earlier[0]) return toResult(earlier[0])

    const file = readFile(input.csv)
    const defaults = {
      countryDefault: input.countryDefault ?? '',
      sourceDefaultId: input.sourceDefaultId ?? '',
    }
    const missing = missingFields({ mapping: input.mapping, ...defaults })

    if (missing.length > 0) {
      throw validationFailed(`Choose a column for: ${missing.join(', ')}`, {
        issues: missing.map((field) => ({ field: `mapping.${field}`, message: 'Choose a column' })),
        missing,
      })
    }

    const verdicts = await judge({ rows: file.rows, mapping: input.mapping, ...defaults })
    const accepted = verdicts.filter((verdict) => verdict.fields)
    const rejected = verdicts.filter((verdict) => verdict.reason)

    const { rows: created } = await db.query<ImportRow>(
      `INSERT INTO v2_lead_imports (idempotency_key, file_name, header, total_rows, accepted_rows, rejected_rows)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6) RETURNING *`,
      [
        input.idempotencyKey,
        input.fileName ?? '',
        JSON.stringify(file.header),
        verdicts.length,
        accepted.length,
        rejected.length,
      ],
    )
    const record = created[0]!
    const stage = await choices.stageOfKind('new')

    for (let start = 0; start < accepted.length; start += BATCH) {
      const batch = accepted.slice(start, start + BATCH).map((verdict) => verdict.fields!)

      await db.query(
        `INSERT INTO v2_leads
           (name, email, phone, phone_key, country_code, company, notes, source_id, niche_id, stage_id, import_id)
         SELECT name, email, phone, phone_key, country_code, company, notes, source_id, niche_id, $10, $11
           FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::uuid[], $9::uuid[])
             AS t(name, email, phone, phone_key, country_code, company, notes, source_id, niche_id)`,
        [
          batch.map((f) => f.name),
          batch.map((f) => f.email),
          batch.map((f) => f.phone),
          batch.map((f) => phoneKey(f.phone)),
          batch.map((f) => f.country),
          batch.map((f) => f.company),
          batch.map((f) => f.notes),
          batch.map((f) => f.sourceId),
          batch.map((f) => f.nicheId),
          stage.id,
          record.id,
        ],
      )
    }

    for (let start = 0; start < rejected.length; start += BATCH) {
      const batch = rejected.slice(start, start + BATCH)

      await db.query(
        `INSERT INTO v2_lead_import_rejections (import_id, row_number, reason, cells)
         SELECT $1, row_number, reason, cells::jsonb
           FROM unnest($2::int[], $3::text[], $4::text[]) AS t(row_number, reason, cells)`,
        [
          record.id,
          batch.map((verdict) => verdict.row),
          batch.map((verdict) => verdict.reason!),
          batch.map((verdict) => JSON.stringify(verdict.cells)),
        ],
      )
    }

    return toResult(record)
  })

/* ------------------------------------------------------------ past imports */

const findImport = async (id: string): Promise<ImportRow> => {
  const { rows } = await getDb().query<ImportRow>('SELECT * FROM v2_lead_imports WHERE id = $1', [
    id,
  ])

  if (!rows[0]) throw notFound('That import does not exist')

  return rows[0]
}

export const listImports = async (input: {
  page: number
  pageSize: number
}): Promise<Page<ImportResult>> => {
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string | number }>(
    'SELECT count(*) AS total FROM v2_lead_imports',
  )
  const total = Number(counted[0]?.total ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / input.pageSize))
  const page = Math.min(input.page, pageCount)
  const { rows } = await db.query<ImportRow>(
    'SELECT * FROM v2_lead_imports ORDER BY created_at DESC, id LIMIT $1 OFFSET $2',
    [input.pageSize, (page - 1) * input.pageSize],
  )

  return {
    items: rows.map(toResult),
    page,
    pageSize: input.pageSize,
    total,
    pageCount,
    hasMore: page < pageCount,
  }
}

/** One import and a page of its rejected rows. */
export const getImport = async (input: {
  id: string
  page: number
  pageSize: number
}): Promise<
  ImportResult & { rejections: Page<{ row: number; reason: string; cells: string[] }> }
> => {
  const record = await findImport(input.id)
  const total = record.rejected_rows
  const pageCount = Math.max(1, Math.ceil(total / input.pageSize))
  const page = Math.min(input.page, pageCount)
  const { rows } = await getDb().query<{ row_number: number; reason: string; cells: string[] }>(
    `SELECT row_number, reason, cells FROM v2_lead_import_rejections
      WHERE import_id = $1 ORDER BY row_number LIMIT $2 OFFSET $3`,
    [record.id, input.pageSize, (page - 1) * input.pageSize],
  )

  return {
    ...toResult(record),
    rejections: {
      items: rows.map((row) => ({ row: row.row_number, reason: row.reason, cells: row.cells })),
      page,
      pageSize: input.pageSize,
      total,
      pageCount,
      hasMore: page < pageCount,
    },
  }
}

/** The rejected rows as a CSV: the file's own columns, plus row and reason. */
export const rejectionReport = async (id: string): Promise<{ fileName: string; csv: string }> => {
  const record = await findImport(id)
  const { rows } = await getDb().query<{ row_number: number; reason: string; cells: string[] }>(
    'SELECT row_number, reason, cells FROM v2_lead_import_rejections WHERE import_id = $1 ORDER BY row_number',
    [record.id],
  )
  const base = (record.file_name || 'import').replace(/\.csv$/iu, '')

  return {
    fileName: `${base}-rejected.csv`,
    csv: writeCsv([
      ['Row', 'Reason', ...record.header],
      ...rows.map((row) => [String(row.row_number), row.reason, ...row.cells]),
    ]),
  }
}

/** Removes the report. The imported Leads stay. */
export const deleteImport = async (id: string): Promise<{ id: string; deleted: true }> => {
  const record = await findImport(id)

  await getDb().query('DELETE FROM v2_lead_imports WHERE id = $1', [record.id])

  return { id, deleted: true }
}
