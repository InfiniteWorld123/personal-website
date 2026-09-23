import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { AlertTriangle, ArrowLeft, Download, FileText, Loader2, Upload } from 'lucide-react'
import { COUNTRIES, isCountryCode } from '#/backend2/contracts/country.contract'
import type { ImportField, ImportMapping, ImportPreview, ImportResult } from '#/backend2/contracts/lead.contract'
import { IMPORT_FIELDS, LEAD_IMPORT_LIMITS } from '#/backend2/contracts/lead.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead, StatusChip } from '#/frontend/dashboard/primitives'
import { ConfirmDialog } from '#/frontend/features/blog-v2/BlogDialog'
import { rejectionReportUrl } from '#/frontend/features/leads-v2/api'
import { formatDay, newImportKey, serverFieldErrors } from '#/frontend/features/leads-v2/lead-form'
import {
  useChoices,
  useCommitImport,
  useDeleteImport,
  useImports,
  usePreviewImport,
} from '#/frontend/features/leads-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { EmptyState, LoadFailure, Pager, RowSkeleton } from './lead-parts'

/**
 * Importing leads from a CSV file, in the four steps approved in the Leads
 * Design Lab (23 Sep 2026): choose the file, match its columns, check every
 * row, import.
 *
 * Nothing is saved before "Import". The file is read in the browser, and
 * each look at it is a server preview that writes nothing. The import itself
 * carries one key per file, made when the owner reaches the check, so a
 * double click — or a retry after an answer that never arrived — gets the
 * first result back instead of a second import. No one is contacted and
 * nothing is sent: this is typing leads in, many at once.
 */

const STEPS = ['Choose file', 'Match columns', 'Check & import', 'Done'] as const

type Step = 1 | 2 | 3 | 4

/** `note` is a warning about how the file's letters were read, shown next to its columns and rows. */
type LoadedFile = { csv: string; fileName: string; note: string | null }

const FIELD_LABEL: Record<ImportField, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  country: 'Country',
  source: 'Source',
  company: 'Company',
  niche: 'Niche',
  notes: 'Notes',
}

/** What a lead cannot be saved without. Country and source may instead be one choice for the whole file. */
const REQUIRED: ReadonlySet<ImportField> = new Set(['name', 'email', 'phone', 'country', 'source'])

const LIMIT_MB = LEAD_IMPORT_LIMITS.bytes / (1024 * 1024)

const PAST_PAGE_SIZE = 10

const plural = (count: number, one: string, many: string) => `${count.toLocaleString('en')} ${count === 1 ? one : many}`

const sentence = (text: string) => (/[.!?]$/u.test(text.trim()) ? text.trim() : `${text.trim()}.`)

/**
 * A refusal in words the owner can act on — the server's own sentence when
 * it refused on purpose, ours when it did not answer.
 */
const failureText = (error: unknown, fallback: string): string => {
  if (error instanceof ApiRequestError) {
    if (error.code === 'BODY_TOO_LARGE') {
      return 'This file is too large to send in one piece. Split it into smaller files and import each one.'
    }

    if (error.status < 500) return sentence(error.message)
  }

  return fallback
}

/** The browser's own checks, before anything leaves it: one file, a CSV, not empty, not over the limit. */
const fileProblem = (files: File[]): string | null => {
  if (files.length === 0) return 'Choose a CSV file.'
  if (files.length > 1) return 'Drop one file at a time.'

  const file = files[0]!

  if (!/\.(csv|tsv|txt)$/iu.test(file.name) && file.type !== 'text/csv') {
    return `“${file.name}” is not a CSV file. In your spreadsheet, save or export it as CSV, then choose that file.`
  }

  if (file.size === 0) return `“${file.name}” is empty.`

  if (file.size > LEAD_IMPORT_LIMITS.bytes) {
    return `“${file.name}” is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${LIMIT_MB} MB — split it into smaller files and import each one.`
  }

  return null
}

/* ---------------------------------------------------------------- encoding */

/**
 * What a spreadsheet writes when plain "CSV" is chosen instead of "CSV
 * UTF-8": Excel on Windows uses Windows-1252, older Excel on a Mac uses Mac
 * Roman. The system is named so the owner recognises where the file came from.
 */
const LEGACY_ENCODINGS = [
  { label: 'windows-1252', system: 'Windows' },
  { label: 'macintosh', system: 'Mac' },
] as const

/**
 * Western European letters (À–ÿ without × and ÷). Reading a file in the wrong
 * one of the two encodings turns ä, ö, ü and ß into symbols, so the right one
 * is the reading with the most of these letters.
 */
const WESTERN_LETTERS = /[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF]/gu

const UNREADABLE = '\uFFFD'

/** One decoding attempt; `null` when the bytes are not valid in it, or the browser does not know it. */
const decodeAs = (label: string, data: Uint8Array, fatal = false): string | null => {
  try {
    return new TextDecoder(label, { fatal }).decode(data)
  } catch {
    return null
  }
}

/**
 * The file's text, read in the encoding it was saved in. `File.text()`
 * always assumes UTF-8 and quietly turns every other letter into "�", but a
 * German spreadsheet saved as plain CSV is not UTF-8: "Weiß" would be
 * imported as "Wei�", and "Österreich" refused as an unknown country with a
 * reason that points at the wrong problem. So a byte-order mark decides first
 * (Excel's "Unicode Text" is UTF-16 and starts with one), then strict UTF-8,
 * and only a file that is not valid UTF-8 is read in the older encoding whose
 * letters make sense. That last step is a guess, so the owner is told, and is
 * told too when letters still could not be read — nothing is changed quietly.
 */
const decodeCsv = (bytes: ArrayBuffer): { csv: string; note: string | null } => {
  const data = new Uint8Array(bytes)
  const marked =
    data[0] === 0xff && data[1] === 0xfe ? 'utf-16le' : data[0] === 0xfe && data[1] === 0xff ? 'utf-16be' : null
  let csv = marked ? decodeAs(marked, data) : decodeAs('utf-8', data, true)
  let note: string | null = null

  if (csv === null) {
    let best: { text: string; letters: number; system: string } | null = null

    for (const { label, system } of LEGACY_ENCODINGS) {
      const text = decodeAs(label, data)

      if (text === null) continue

      const letters = text.match(WESTERN_LETTERS)?.length ?? 0

      // A tie keeps the first, Windows: it is what most spreadsheets in Germany write.
      if (!best || letters > best.letters) best = { text, letters, system }
    }

    if (best) {
      csv = best.text
      note = `This file is not saved as UTF-8, so its letters were read the way a ${best.system} spreadsheet saves them. If names with ä, ö, ü or ß look wrong, save the file as “CSV UTF-8” in your spreadsheet and choose it again.`
    } else {
      csv = new TextDecoder().decode(data)
    }
  }

  if (csv.includes(UNREADABLE)) {
    note = `Some letters in this file could not be read and show as “${UNREADABLE}”. Check the names before importing — or save the file as “CSV UTF-8” in your spreadsheet and choose it again.`
  }

  return { csv, note }
}

/** The warning from `decodeCsv`. It does not stop the import: the owner sees the rows and decides. */
function FileNote({ note }: { note: string | null }) {
  if (!note) return null

  return (
    <p className="flex items-start gap-2 rounded-[10px] bg-[var(--dash-furniture)] px-3.5 py-2.5 text-[12.5px] leading-relaxed">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--dash-red-ink)]" aria-hidden="true" />
      <span>{note}</span>
    </p>
  )
}

/* ----------------------------------------------------------------- mapping */

/** The mapping form: a column's index as text ('' is "Not in the file"), and the two whole-file choices. */
type MappingValues = Record<ImportField, string> & { countryDefault: string; sourceDefaultId: string }

type MappingField = keyof MappingValues

const MAPPING_FIELDS: readonly MappingField[] = [...IMPORT_FIELDS, 'countryDefault', 'sourceDefaultId']

const toValues = (mapping: ImportMapping): MappingValues => {
  const values = { countryDefault: '', sourceDefaultId: '' } as MappingValues

  for (const field of IMPORT_FIELDS) values[field] = mapping[field] === null ? '' : String(mapping[field])

  return values
}

/**
 * What the server is asked. A whole-file choice is sent only while its
 * column is "Not in the file": a column always wins on the server, and a
 * stale choice left behind should not be able to refuse the preview.
 */
const toRequest = (values: MappingValues) => {
  const mapping = {} as ImportMapping

  for (const field of IMPORT_FIELDS) mapping[field] = values[field] === '' ? null : Number(values[field])

  return {
    mapping,
    countryDefault: values.country === '' ? values.countryDefault : '',
    sourceDefaultId: values.source === '' ? values.sourceDefaultId : '',
  }
}

const requestKey = (values: MappingValues) => JSON.stringify(toRequest(values))

/** The same rule as the server's `missing`, worded for the field the owner has to change. */
const mappingErrors = (values: MappingValues): Partial<Record<MappingField, string>> => {
  const errors: Partial<Record<MappingField, string>> = {}

  if (values.name === '') errors.name = 'Choose the column with the names'
  if (values.email === '') errors.email = 'Choose the column with the email addresses'
  if (values.phone === '') errors.phone = 'Choose the column with the phone numbers'
  if (values.country === '' && !isCountryCode(values.countryDefault)) {
    errors.countryDefault = 'Choose the country for every row'
  }
  if (values.source === '' && values.sourceDefaultId === '') errors.sourceDefaultId = 'Choose the source for every row'

  return errors
}

/** The server's field refusals (`mapping.phone`, `sourceDefaultId`), keyed like the form's own. */
const serverMappingErrors = (error: unknown): Partial<Record<MappingField, string>> => {
  const errors: Partial<Record<MappingField, string>> = {}

  for (const [path, message] of Object.entries(serverFieldErrors(error))) {
    const field = path.replace(/^mapping\./u, '') as MappingField

    if (MAPPING_FIELDS.includes(field) && !errors[field]) errors[field] = message
  }

  return errors
}

/* ------------------------------------------------------------------ pieces */

const errorId = (field: string) => `import-${field}-error`

function FieldError({ field, message }: { field: string; message?: string }) {
  if (!message) return null

  return (
    <span id={errorId(field)} className="flex items-center gap-1.5 text-[12px] text-[var(--dash-red-ink)]">
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
      {message}
    </span>
  )
}

function Label({ htmlFor, children, optional }: { htmlFor: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-[12.5px] font-semibold">
      {children}
      {optional ? <span className="font-normal text-[var(--dash-quiet)]"> (optional)</span> : null}
    </label>
  )
}

function Steps({ step }: { step: Step }) {
  return (
    <ol aria-label="Import steps" className="flex flex-wrap gap-1.5 text-[12px]">
      {STEPS.map((title, index) => (
        <li
          key={title}
          aria-current={step === index + 1 ? 'step' : undefined}
          className={cn(
            'rounded-full px-2.5 py-1 font-semibold',
            step === index + 1
              ? 'bg-[var(--dash-slab)] text-[var(--dash-slab-ink)]'
              : 'bg-[var(--dash-chip)] text-[var(--dash-quiet)]',
          )}
        >
          {index + 1} · {title}
        </li>
      ))}
    </ol>
  )
}

function Tally({ value, label, tone }: { value: number; label: string; tone?: 'blue' | 'red' }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-[var(--dash-line)] px-3 py-2.5 sm:min-w-[120px] sm:px-3.5">
      <strong
        className={cn(
          'dash-num block text-[22px] leading-tight',
          tone === 'blue' && 'text-[var(--dash-blue-ink)]',
          tone === 'red' && 'text-[var(--dash-red-ink)]',
        )}
      >
        {value.toLocaleString('en')}
      </strong>
      <span className="text-[12px] text-[var(--dash-quiet)]">{label}</span>
    </div>
  )
}

/* ---------------------------------------------------------- 1 · the file */

function ChooseFile({
  reading,
  problem,
  onFiles,
}: {
  reading: string | null
  problem: string | null
  onFiles: (files: File[]) => void
}) {
  const [over, setOver] = useState(false)
  const busy = reading !== null

  return (
    <>
      <div
        className={cn(
          'flex flex-col items-center gap-2.5 rounded-xl border-2 border-dashed px-5 py-7 text-center text-[13px] text-[var(--dash-quiet)]',
          over ? 'border-[var(--dash-blue)] bg-[var(--dash-blue-tint)]' : 'border-[var(--dash-line)]',
        )}
        onDragEnter={(event) => {
          event.preventDefault()
          if (!busy) setOver(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = busy ? 'none' : 'copy'
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          if (!busy) onFiles(Array.from(event.dataTransfer.files))
        }}
      >
        <Upload className="size-5" aria-hidden="true" />
        <strong className="text-[var(--dash-ink)]">Choose a CSV file from your computer</strong>
        <span id="import-file-hint">
          Comma or semicolon. Up to {LEAD_IMPORT_LIMITS.rows.toLocaleString('en')} rows or {LIMIT_MB} MB. Nothing is
          saved until you confirm.
        </span>
        <label
          className={cn(
            'dash-btn dash-btn-primary cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--dash-blue)]',
            busy && 'pointer-events-none opacity-70',
          )}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? 'Reading…' : 'Choose file'}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={busy}
            aria-invalid={problem ? true : undefined}
            aria-describedby={cn('import-file-hint', problem && 'import-file-problem')}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? [])

              // Reset, so choosing the same file again after fixing it still reads it.
              event.target.value = ''
              if (files.length > 0) onFiles(files)
            }}
          />
        </label>
        <span className="text-[12px]" aria-live="polite">
          {busy ? `Checking “${reading}”…` : 'or drop it here'}
        </span>
      </div>

      {problem ? (
        <p
          id="import-file-problem"
          role="alert"
          className="dash-tone-red flex items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px]"
        >
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {problem}
        </p>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------- 2 · the columns */

function MappingStep({
  file,
  initial,
  initialPreview,
  onBack,
  onNext,
}: {
  file: LoadedFile
  initial: MappingValues
  initialPreview: ImportPreview
  onBack: () => void
  onNext: (values: MappingValues, preview: ImportPreview) => void
}) {
  const check = usePreviewImport()
  const sources = useChoices('sources', { hidden: 'exclude', pageSize: 100 })
  // The first answer is the one the owner arrived with: from step 1, or from before "Back".
  const [answer, setAnswer] = useState(() => ({ key: requestKey(initial), preview: initialPreview }))
  const answered = useRef(answer)
  const requested = useRef(answer.key)
  const latest = useRef(0)
  const [checking, setChecking] = useState(false)
  const [failure, setFailure] = useState<{ message: string; retry: boolean } | null>(null)
  const [serverErrors, setServerErrors] = useState<Partial<Record<MappingField, string>>>({})

  const focusFirstInvalid = () =>
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('#import-mapping [aria-invalid="true"], #import-mapping-failure')?.focus(),
    )

  /**
   * Asks the server about the file as it is now matched. Only the newest
   * answer counts: an older one that arrives late is dropped rather than
   * shown against columns the owner has since changed.
   */
  const run = async (values: MappingValues): Promise<ImportPreview | null> => {
    const ask = ++latest.current
    const request = toRequest(values)

    requested.current = JSON.stringify(request)
    setChecking(true)

    try {
      const next = await check.mutateAsync({ csv: file.csv, fileName: file.fileName, ...request })

      if (ask !== latest.current) return null

      answered.current = { key: requested.current, preview: next }
      setAnswer(answered.current)
      setFailure(null)
      setServerErrors({})

      return next
    } catch (caught) {
      if (ask !== latest.current) return null

      const fields = serverMappingErrors(caught)

      setServerErrors(fields)
      setFailure(
        Object.keys(fields).length > 0
          ? null
          : {
              message: failureText(caught, 'The rows could not be checked. Nothing was saved — try again.'),
              retry: true,
            },
      )

      return null
    } finally {
      if (ask === latest.current) setChecking(false)
    }
  }

  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = mappingErrors(value)

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      // The rows shown next must be the answer for exactly these columns, so an out-of-date one is asked again.
      const checked = answered.current.key === requestKey(value) ? answered.current.preview : await run(value)

      if (!checked) {
        focusFirstInvalid()

        return
      }

      if (checked.missing.length > 0) {
        setFailure({
          message: `Still to match: ${checked.missing.map((field) => FIELD_LABEL[field]).join(', ')}.`,
          retry: false,
        })
        focusFirstInvalid()

        return
      }

      onNext(value, checked)
    },
  })

  const countryColumn = useStore(form.store, (state) => state.values.country)
  const sourceColumn = useStore(form.store, (state) => state.values.source)
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  const { preview } = answer

  const errorFor = (field: MappingField, errors: unknown[]) => (errors[0] as string | undefined) ?? serverErrors[field]

  /** Every change is checked again at once, so the count below always matches the columns shown. */
  const changed = (field: MappingField, value: string) => {
    setServerErrors((current) => ({ ...current, [field]: undefined }))

    const next = { ...form.state.values, [field]: value }

    if (requestKey(next) !== requested.current) void run(next)
  }

  const columns = preview.header.map((heading, index) => ({
    value: String(index),
    label: heading === '' ? `Column ${index + 1} (no heading)` : heading,
  }))

  return (
    <form
      id="import-mapping"
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="flex flex-col gap-1">
        <p className="flex min-w-0 items-center gap-2 text-[12.5px] text-[var(--dash-quiet)]">
          <FileText className="size-3.5 shrink-0" aria-hidden="true" />
          <strong className="truncate font-semibold text-[var(--dash-ink)]">{file.fileName}</strong>
          <span className="shrink-0">· {plural(preview.totalRows, 'row', 'rows')}</span>
        </p>
        <p className="text-[13px]">We guessed from your file’s first row. Check each one.</p>
      </div>

      <FileNote note={file.note} />

      {failure ? (
        <div
          id="import-mapping-failure"
          role="alert"
          tabIndex={-1}
          className="dash-tone-red flex flex-col items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px] outline-none"
        >
          {failure.message}
          {failure.retry ? (
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8 text-[12px]"
              disabled={checking}
              onClick={() => void run(form.state.values)}
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-3">
        {IMPORT_FIELDS.map((field) => (
          <form.Field key={field} name={field}>
            {(api) => {
              const error = errorFor(field, api.state.meta.errors)
              const id = `import-map-${field}`
              const choosable = field === 'country' || field === 'source'

              return (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor={id} optional={!REQUIRED.has(field)}>
                    {FIELD_LABEL[field]}
                  </Label>
                  <select
                    id={id}
                    className="dash-field h-10 w-full px-2.5 text-[13px]"
                    value={api.state.value}
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId(field) : undefined}
                    onChange={(event) => {
                      api.handleChange(event.target.value)
                      changed(field, event.target.value)
                    }}
                    onBlur={api.handleBlur}
                  >
                    <option value="">{choosable ? 'Not in the file — choose one below' : 'Not in the file'}</option>
                    {columns.map((column) => (
                      <option key={column.value} value={column.value}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                  <FieldError field={field} message={error} />
                </div>
              )
            }}
          </form.Field>
        ))}
      </div>

      {countryColumn === '' || sourceColumn === '' ? (
        <div className="grid max-w-[40rem] grid-cols-1 gap-3 sm:grid-cols-2">
          {countryColumn === '' ? (
            <form.Field name="countryDefault">
              {(api) => {
                const error = errorFor('countryDefault', api.state.meta.errors)

                return (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="import-country-default">Country for every row</Label>
                    <select
                      id="import-country-default"
                      className="dash-field h-10 w-full px-2.5 text-[13px]"
                      value={api.state.value}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={cn(error && errorId('countryDefault'), 'import-country-default-hint')}
                      onChange={(event) => {
                        api.handleChange(event.target.value)
                        changed('countryDefault', event.target.value)
                      }}
                      onBlur={api.handleBlur}
                    >
                      <option value="">Choose a country</option>
                      {COUNTRIES.map((country) => (
                        <option key={country.code} value={country.code}>
                          {country.name}
                        </option>
                      ))}
                    </select>
                    <FieldError field="countryDefault" message={error} />
                    <span id="import-country-default-hint" className="text-[11.5px] text-[var(--dash-quiet)]">
                      Your file has no country column, so every lead gets this one.
                    </span>
                  </div>
                )
              }}
            </form.Field>
          ) : null}

          {sourceColumn === '' ? (
            <form.Field name="sourceDefaultId">
              {(api) => {
                const error = errorFor('sourceDefaultId', api.state.meta.errors)
                const loading = sources.isPending && !sources.data

                return (
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <Label htmlFor="import-source-default">Source for every row</Label>
                    <select
                      id="import-source-default"
                      className="dash-field h-10 w-full px-2.5 text-[13px]"
                      value={api.state.value}
                      disabled={loading}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={cn(error && errorId('sourceDefaultId'), 'import-source-default-hint')}
                      onChange={(event) => {
                        api.handleChange(event.target.value)
                        changed('sourceDefaultId', event.target.value)
                      }}
                      onBlur={api.handleBlur}
                    >
                      <option value="">{loading ? 'Loading sources…' : 'Choose a source'}</option>
                      {(sources.data?.items ?? []).map((source) => (
                        <option key={source.id} value={source.id}>
                          {source.name}
                        </option>
                      ))}
                    </select>
                    <FieldError field="sourceDefaultId" message={error} />
                    {sources.isError ? (
                      <span className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--dash-red-ink)]">
                        Your sources could not be loaded.
                        <button
                          type="button"
                          className="font-semibold underline underline-offset-2"
                          onClick={() => void sources.refetch()}
                        >
                          Try again
                        </button>
                      </span>
                    ) : null}
                    <span id="import-source-default-hint" className="text-[11.5px] text-[var(--dash-quiet)]">
                      Your file has no source column, so every lead gets this one.
                    </span>
                  </div>
                )
              }}
            </form.Field>
          ) : null}
        </div>
      ) : null}

      <p
        role="status"
        className={cn(
          'flex items-start gap-2 rounded-[10px] px-3.5 py-2.5 text-[12.5px] leading-relaxed',
          preview.missing.length > 0 ? 'bg-[var(--dash-furniture)]' : 'bg-[var(--dash-blue-tint)]',
        )}
      >
        {checking ? (
          <>
            <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin" aria-hidden="true" />
            Checking the rows…
          </>
        ) : preview.missing.length > 0 ? (
          <>
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--dash-red-ink)]" aria-hidden="true" />
            <span>
              <strong>Still to match: {preview.missing.map((field) => FIELD_LABEL[field]).join(', ')}.</strong> Every
              lead needs a name, email, phone, country and source.
            </span>
          </>
        ) : (
          <span>
            <strong className="dash-num">
              {preview.accepted.toLocaleString('en')} of {plural(preview.totalRows, 'row', 'rows')}
            </strong>{' '}
            can be imported as matched. You will see each row next.
          </span>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--dash-line)] pt-4">
        <span className="flex-1" />
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onBack}>
          Back
        </button>
        <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {submitting ? 'Checking…' : 'Check the rows'}
        </button>
      </div>
    </form>
  )
}

/* --------------------------------------------------------- 3 · the check */

type CommitFailure = { message: string; next: 'retry' | 'columns' | 'file' }

function CheckStep({
  file,
  values,
  preview,
  importKey,
  onBack,
  onRestart,
  onDone,
}: {
  file: LoadedFile
  values: MappingValues
  preview: ImportPreview
  importKey: string
  onBack: () => void
  onRestart: () => void
  onDone: (result: ImportResult) => void
}) {
  const commit = useCommitImport()
  const sending = useRef(false)
  const alert = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState<CommitFailure | null>(null)
  const count = preview.accepted
  const more = preview.rejected - preview.rejections.length

  const confirm = async () => {
    // The button is disabled while this runs; the ref covers the click that lands before it re-renders.
    if (sending.current) return

    sending.current = true
    setFailure(null)

    try {
      const result = await commit.mutateAsync({
        csv: file.csv,
        fileName: file.fileName,
        ...toRequest(values),
        idempotencyKey: importKey,
      })

      notify.success(
        result.accepted === 1 ? '1 lead imported' : `${result.accepted.toLocaleString('en')} leads imported`,
      )
      onDone(result)
    } catch (caught) {
      const code = caught instanceof ApiRequestError ? caught.code : null

      setFailure(
        code === 'BODY_TOO_LARGE'
          ? { next: 'file', message: failureText(caught, '') }
          : code === 'VALIDATION_ERROR'
            ? { next: 'columns', message: `${failureText(caught, '')} Nothing was imported.` }
            : {
                next: 'retry',
                message:
                  caught instanceof ApiRequestError && caught.status < 500
                    ? sentence(caught.message)
                    : 'The server did not confirm the import. Try again — this import is recognised, so nothing can be imported twice.',
              },
      )
      window.requestAnimationFrame(() => alert.current?.focus())
    } finally {
      sending.current = false
    }
  }

  return (
    <>
      {/* Repeated here, where the names are: this is where a letter that was read wrongly shows. */}
      <FileNote note={file.note} />

      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-2.5">
        <Tally value={preview.totalRows} label="rows in the file" />
        <Tally value={preview.accepted} label="will be imported" tone="blue" />
        <Tally value={preview.rejected} label="will be skipped" tone="red" />
      </div>

      <div className="flex flex-col gap-1.5">
        {preview.totalRows > preview.rows.length ? (
          <p className="text-[12px] text-[var(--dash-quiet)]">
            The first {preview.rows.length} of {plural(preview.totalRows, 'row', 'rows')}:
          </p>
        ) : null}
        <div
          role="region"
          aria-label="Rows in the file"
          tabIndex={0}
          className="overflow-x-auto rounded-[10px] border border-[var(--dash-line)]"
        >
          <table className="w-full min-w-[620px] border-collapse text-[12.5px]">
            <caption className="sr-only">Each row of the file and what will happen to it</caption>
            <thead>
              <tr>
                {['Row', 'Name', 'Email', 'Phone', 'Result'].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="border-b border-[var(--dash-line)] px-2.5 py-2 text-start text-[10.5px] font-semibold tracking-[.1em] text-[var(--dash-quiet)] uppercase"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.rows.map((row) => (
                <tr key={row.row} className={cn(!row.accepted && 'bg-[var(--dash-red-tint)]')}>
                  <td className="dash-num border-t border-[var(--dash-soft)] px-2.5 py-2 align-top">{row.row}</td>
                  <td className="border-t border-[var(--dash-soft)] px-2.5 py-2 align-top">{row.lead?.name || '—'}</td>
                  <td className="border-t border-[var(--dash-soft)] px-2.5 py-2 align-top break-all">
                    {row.lead?.email || '—'}
                  </td>
                  <td className="dash-num border-t border-[var(--dash-soft)] px-2.5 py-2 align-top">
                    {row.lead?.phone || '—'}
                  </td>
                  <td className="border-t border-[var(--dash-soft)] px-2.5 py-2 align-top">
                    {row.accepted ? (
                      <StatusChip tone="blue">Import</StatusChip>
                    ) : (
                      <span>
                        <span className="sr-only">Skipped: </span>
                        {row.reason}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {preview.rejections.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-[12.5px] font-semibold">
            Why rows will be skipped
            {more > 0 ? (
              <span className="font-normal text-[var(--dash-quiet)]"> · the first {preview.rejections.length}</span>
            ) : null}
          </h3>
          <ul
            aria-label="Skipped rows"
            tabIndex={0}
            className="max-h-60 overflow-y-auto rounded-[10px] border border-[var(--dash-line)] text-[12.5px]"
          >
            {preview.rejections.map((rejection) => (
              <li
                key={rejection.row}
                className="flex gap-3 border-t border-[var(--dash-soft)] px-3 py-1.5 first:border-0"
              >
                <span className="dash-num w-16 shrink-0 text-[var(--dash-quiet)]">Row {rejection.row}</span>
                <span className="min-w-0">{rejection.reason}</span>
              </li>
            ))}
          </ul>
          {more > 0 ? (
            <p className="text-[12px] text-[var(--dash-quiet)]">
              And {plural(more, 'more row', 'more rows')}. Every one is in the report you can download after importing.
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-[12px] text-[var(--dash-quiet)]">
        Skipped rows are never guessed or merged. After importing you can download them with the reason next to each,
        fix them, and import that file.
      </p>

      {failure ? (
        <div
          ref={alert}
          role="alert"
          tabIndex={-1}
          className="dash-tone-red flex flex-col items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px] outline-none"
        >
          {failure.message}
          {failure.next === 'retry' ? (
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8 text-[12px]"
              disabled={commit.isPending}
              onClick={() => void confirm()}
            >
              Try again
            </button>
          ) : failure.next === 'columns' ? (
            <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={onBack}>
              Back to the columns
            </button>
          ) : (
            <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={onRestart}>
              Choose another file
            </button>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--dash-line)] pt-4">
        {count === 0 ? (
          <span className="text-[12px] text-[var(--dash-quiet)]">
            No row can be imported yet. Go back to change the columns, or fix the file and choose it again.
          </span>
        ) : null}
        <span className="flex-1" />
        <button type="button" className="dash-btn dash-btn-ghost" disabled={commit.isPending} onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-primary"
          disabled={count === 0 || commit.isPending}
          onClick={() => void confirm()}
        >
          {commit.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {commit.isPending ? 'Importing…' : `Import ${plural(count, 'lead', 'leads')}`}
        </button>
      </div>
    </>
  )
}

/* ---------------------------------------------------------- 4 · the result */

function DoneStep({ result, onAgain }: { result: ImportResult; onAgain: () => void }) {
  return (
    <>
      <p className="rounded-xl bg-[var(--dash-blue-tint)] px-4 py-3.5 text-[13px] leading-relaxed">
        <strong>
          {result.accepted === 0
            ? 'No leads were imported.'
            : `${plural(result.accepted, 'lead', 'leads')} imported into New.`}
        </strong>{' '}
        {result.rejected === 0
          ? 'No rows were skipped.'
          : `${plural(result.rejected, 'row was', 'rows were')} skipped.`}{' '}
        {result.accepted > 0 ? 'Importing the same file again cannot create them twice.' : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {result.rejected > 0 ? (
          <a href={rejectionReportUrl(result.id)} download className="dash-btn dash-btn-quiet">
            <Download className="size-4" aria-hidden="true" />
            Download the {plural(result.rejected, 'skipped row', 'skipped rows')}
          </a>
        ) : null}
        <Link to="/dashboard/leads" className="dash-btn dash-btn-primary">
          See the leads
        </Link>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onAgain}>
          Import another file
        </button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------ past imports */

const importedAt = (iso: string) =>
  `${formatDay(iso)}, ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}`

/**
 * Every import's record, newest first, so a skipped-rows report can be
 * fetched again later. Deleting a report removes only the record and its
 * skipped rows; the leads it created stay.
 */
function PastImports() {
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState<ImportResult | null>(null)
  const imports = useImports({ page, pageSize: PAST_PAGE_SIZE })
  const remove = useDeleteImport()
  const items = imports.data?.items ?? []

  return (
    <section aria-labelledby="past-imports-title" className="flex flex-col gap-3">
      <h2 id="past-imports-title" className="text-sm font-semibold">
        Past imports
      </h2>

      <div className="dash-panel overflow-hidden">
        {imports.isError ? (
          <LoadFailure
            title="Past imports could not be loaded"
            message="The server did not answer. Nothing has been changed."
            onRetry={() => void imports.refetch()}
          />
        ) : imports.isPending ? (
          <ul aria-busy="true" aria-label="Loading past imports">
            {Array.from({ length: 2 }, (_, index) => (
              <RowSkeleton key={index} />
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState title="No imports yet">
            Each file you import is listed here, with its skipped rows ready to download.
          </EmptyState>
        ) : (
          <ul aria-busy={imports.isFetching}>
            {items.map((item) => {
              const name = item.fileName || 'Untitled file'

              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 border-t border-[var(--dash-soft)] px-4 py-3 first:border-0 sm:px-5"
                >
                  <span
                    aria-hidden="true"
                    className="dash-tone-grey grid size-8 shrink-0 place-items-center rounded-[9px]"
                  >
                    <FileText className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[13.5px]">{name}</strong>
                    <span className="block text-[12px] text-[var(--dash-quiet)]">
                      {importedAt(item.createdAt)} ·{' '}
                      <span className="dash-num">{item.accepted.toLocaleString('en')}</span> imported ·{' '}
                      <span className="dash-num">{item.rejected.toLocaleString('en')}</span> skipped
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    {item.rejected > 0 ? (
                      <a
                        href={rejectionReportUrl(item.id)}
                        download
                        className="dash-btn dash-btn-quiet h-8 text-[12.5px]"
                      >
                        <Download className="size-3.5" aria-hidden="true" />
                        Skipped rows<span className="sr-only"> from {name}</span>
                      </a>
                    ) : null}
                    <button
                      type="button"
                      className="dash-btn dash-btn-quiet h-8 text-[12.5px] text-[var(--dash-red-ink)]"
                      onClick={() => setDeleting(item)}
                    >
                      Delete report<span className="sr-only"> for {name}</span>
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {imports.data ? (
        <Pager
          page={imports.data.page}
          pageCount={imports.data.pageCount}
          total={imports.data.total}
          noun={['import', 'imports']}
          onPage={setPage}
        />
      ) : null}

      {deleting ? (
        <ConfirmDialog
          title={`Delete the report for ${deleting.fileName || 'this file'}?`}
          confirmLabel="Delete report"
          busyLabel="Deleting…"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await remove.mutateAsync(deleting.id)
            notify.success('Report deleted')
            setDeleting(null)
          }}
        >
          <p>
            Only the record of this import{deleting.rejected > 0 ? ' and its skipped rows are' : ' is'} removed.
            {deleting.accepted > 0
              ? ` The ${plural(deleting.accepted, 'lead', 'leads')} it imported stay exactly as they are.`
              : null}
          </p>
        </ConfirmDialog>
      ) : null}
    </section>
  )
}

/* -------------------------------------------------------------------- page */

export function ImportPage() {
  const firstLook = usePreviewImport()
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<LoadedFile | null>(null)
  const [values, setValues] = useState<MappingValues | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [importKey, setImportKey] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const panel = useRef<HTMLElement>(null)
  const moved = useRef(false)

  // After a step changes, keyboard and screen-reader users start at the new step, not at the button they left.
  useEffect(() => {
    if (moved.current) panel.current?.focus()
  }, [step])

  const go = (next: Step) => {
    moved.current = true
    setStep(next)
  }

  const restart = () => {
    setFile(null)
    setValues(null)
    setPreview(null)
    setImportKey(null)
    setResult(null)
    setProblem(null)
    go(1)
  }

  /** Reads the chosen file and asks for a first look, which also suggests the columns. Nothing is saved. */
  const open = async (files: File[]) => {
    if (reading) return

    const refused = fileProblem(files)

    setProblem(refused)
    if (refused) return

    const chosen = files[0]!
    const fileName = chosen.name.slice(0, 200)

    setReading(fileName)

    try {
      // The bytes, not `text()`: that would assume UTF-8 and quietly damage a file saved as plain CSV.
      const bytes = await chosen.arrayBuffer().catch(() => null)

      if (bytes === null) return setProblem(`“${fileName}” could not be read. Choose it again.`)

      const { csv, note } = decodeCsv(bytes)
      const first = await firstLook.mutateAsync({ csv, fileName, countryDefault: '', sourceDefaultId: '' })

      if (first.totalRows === 0) return setProblem(`“${fileName}” has a header row but no leads under it.`)

      setFile({ csv, fileName, note })
      setValues(toValues(first.mapping))
      setPreview(first)
      setImportKey(null)
      go(2)
    } catch (caught) {
      setProblem(failureText(caught, 'The file could not be checked. Nothing was saved — try again.'))
    } finally {
      setReading(null)
    }
  }

  return (
    <DashboardPage className="gap-5">
      <PageHead
        eyebrow="PIPELINE"
        title="Import leads"
        description="From a CSV file on your computer. No one is contacted, and nothing is sent."
        actions={
          <Link to="/dashboard/leads" className="dash-btn dash-btn-quiet">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Leads
          </Link>
        }
      />

      <Steps step={step} />

      <section
        ref={panel}
        tabIndex={-1}
        aria-labelledby="import-step-title"
        className="dash-panel flex flex-col gap-4 p-5 outline-none sm:px-[22px]"
      >
        <h2 id="import-step-title" className="sr-only">
          Step {step} of {STEPS.length}: {STEPS[step - 1]}
        </h2>

        {step === 1 ? <ChooseFile reading={reading} problem={problem} onFiles={(files) => void open(files)} /> : null}

        {step === 2 && file && values && preview ? (
          <MappingStep
            file={file}
            initial={values}
            initialPreview={preview}
            onBack={restart}
            onNext={(next, checked) => {
              setValues(next)
              setPreview(checked)
              // One key per file, made once: going back to the columns and returning keeps it.
              setImportKey((current) => current ?? newImportKey())
              go(3)
            }}
          />
        ) : null}

        {step === 3 && file && values && preview && importKey ? (
          <CheckStep
            file={file}
            values={values}
            preview={preview}
            importKey={importKey}
            onBack={() => go(2)}
            onRestart={restart}
            onDone={(done) => {
              setResult(done)
              go(4)
            }}
          />
        ) : null}

        {step === 4 && result ? <DoneStep result={result} onAgain={restart} /> : null}
      </section>

      <PastImports />
    </DashboardPage>
  )
}
