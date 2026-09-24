import { useEffect, useRef } from 'react'
import {
  IMPORT_KIND_WORDS,
  type ImportPlan,
  type ImportPlanItem,
} from '#/backend2/contracts/import.contract'
import { Panel, PanelHead, StatusChip } from '#/frontend/dashboard/primitives'
import { useLegacyImportPlan, useRunLegacyImport } from '#/frontend/features/legacy-import/api'
import { SettingsSection } from './SettingsLayout'

/**
 * "Copy from the old site": a one-time copy of what the legacy website shows
 * visitors into V2, so the owner starts from it rather than from nothing
 * (owner decision, 24 Sep 2026). Check first — that only reads — then copy.
 *
 * Remove this section with `src/backend2/modules/import/` after the cutover.
 */
export function OldSitePage() {
  const plan = useLegacyImportPlan()
  const run = useRunLegacyImport()
  const summary = useRef<HTMLParagraphElement>(null)
  const data = plan.data

  // Once a plan arrives, the reader is taken to what it says.
  useEffect(() => {
    if (data && !run.isPending) summary.current?.focus()
  }, [data, run.isPending])

  const copy = () => run.mutate(undefined, { onSettled: () => void plan.refetch() })

  return (
    <SettingsSection
      title="Old site"
      description="Start V2 from what your current website shows. The old site is only read — nothing on it changes."
    >
      <Panel>
        <PanelHead title="Copy from the old site" note="Projects, services, the article, booking" />

        <div className="flex flex-col gap-4 border-t border-[var(--dash-soft)] px-5 py-5">
          <p className="max-w-[68ch] text-[13px] leading-relaxed text-[var(--dash-quiet)]">
            Check first: you will see every item, whether it goes live or stays private, and what is
            left for you to finish. Something V2 already has at the same address is never touched,
            and pressing Copy twice creates nothing twice.
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              className={data ? 'dash-btn dash-btn-ghost h-9' : 'dash-btn dash-btn-quiet h-9'}
              onClick={() => void plan.refetch()}
              disabled={plan.isFetching || run.isPending}
              aria-busy={plan.isFetching}
            >
              {plan.isFetching ? 'Checking…' : data ? 'Check again' : 'Check what would be copied'}
            </button>

            {data ? (
              <button
                type="button"
                className="dash-btn dash-btn-primary h-9"
                onClick={copy}
                disabled={data.counts.create === 0 || run.isPending || plan.isFetching}
                aria-busy={run.isPending}
              >
                {run.isPending
                  ? 'Copying…'
                  : data.counts.create === 0
                    ? 'Nothing left to copy'
                    : `Copy ${data.counts.create} item${data.counts.create === 1 ? '' : 's'}`}
              </button>
            ) : null}
          </div>

          {plan.isError && !plan.isFetching ? (
            <p role="alert" className="text-[13px] text-[var(--dash-red-ink)]">
              {plan.error.message}
            </p>
          ) : null}

          <Progress run={run} />

          {data ? <PlanView plan={data} summaryRef={summary} /> : null}
        </div>
      </Panel>
    </SettingsSection>
  )
}

/* ── While it copies, and after ───────────────────────────── */

function Progress({ run }: { run: ReturnType<typeof useRunLegacyImport> }) {
  const progress = run.progress

  if (!progress) return null

  const percent = progress.total === 0 ? 100 : Math.round((progress.done / progress.total) * 100)

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--dash-line)] px-4 py-3">
      <div
        role="progressbar"
        aria-label="Copy progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-[var(--dash-chip)]"
      >
        <div className="h-full rounded-full bg-[var(--dash-brand)]" style={{ width: `${percent}%` }} />
      </div>

      <p aria-live="polite" className="text-[13px]">
        {run.isPending
          ? `Step ${progress.done + 1} of ${Math.max(progress.total, progress.done + 1)}${progress.last ? ` — ${progress.last}` : ''}`
          : run.isError
            ? null
            : progress.done === 0
              ? 'There was nothing left to copy.'
              : `Done. ${progress.done} step${progress.done === 1 ? '' : 's'} finished${
                  progress.problems.length ? `, ${progress.problems.length} with a problem listed below` : ''
                }.`}
      </p>

      {run.isError ? (
        <p role="alert" className="text-[13px] text-[var(--dash-red-ink)]">
          {run.error.message} What was copied before this stays; press Copy again to carry on.
        </p>
      ) : null}

      {progress.problems.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 ps-5 text-[12px] text-[var(--dash-quiet)]">
          {progress.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/* ── The plan ─────────────────────────────────────────────── */

const bytes = (value: number) =>
  value >= 1024 * 1024 ? `${(value / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`

function PlanView({
  plan,
  summaryRef,
}: {
  plan: ImportPlan
  summaryRef: React.RefObject<HTMLParagraphElement | null>
}) {
  const { counts, images } = plan
  const parts = [
    `${counts.create} to copy`,
    counts.done ? `${counts.done} already copied` : null,
    counts.skip ? `${counts.skip} skipped` : null,
    counts.failed ? `${counts.failed} could not be copied` : null,
    images.toCopy
      ? `${images.toCopy} picture${images.toCopy === 1 ? '' : 's'}${images.bytes ? `, ${bytes(images.bytes)}` : ''}${
          images.unknownSizes ? ` (${images.unknownSizes} of unknown size)` : ''
        }`
      : null,
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-4">
      <p ref={summaryRef} tabIndex={-1} className="text-sm font-semibold outline-none">
        {parts.join(' · ')}
      </p>

      <ul className="flex flex-col rounded-[10px] border border-[var(--dash-line)]">
        {plan.items.map((item) => (
          <PlanRow key={`${item.kind}:${item.key}`} item={item} />
        ))}
      </ul>

      <div>
        <p className="dash-eyebrow-quiet">GOOD TO KNOW</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 ps-5 text-[12px] leading-relaxed text-[var(--dash-quiet)]">
          {plan.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const OUTCOME: Record<ImportPlanItem['action'], { word: string; tone: 'blue' | 'grey' | 'outline' | 'ink' }> = {
  create: { word: 'Copies', tone: 'blue' },
  skip: { word: 'Skipped', tone: 'grey' },
  done: { word: 'Already copied', tone: 'ink' },
  failed: { word: 'Not copied', tone: 'outline' },
}

const LANDS: Record<NonNullable<ImportPlanItem['lands']>, string> = {
  published: 'live',
  draft: 'private',
  on: 'bookable',
  off: 'switched off',
  set: 'set',
}

function PlanRow({ item }: { item: ImportPlanItem }) {
  const outcome = OUTCOME[item.action]

  return (
    <li className="flex flex-col gap-2 border-t border-[var(--dash-soft)] px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">{item.label}</p>
          <p className="text-[11px] text-[var(--dash-quiet)]">
            {IMPORT_KIND_WORDS[item.kind]}
            {item.kind !== 'availability' ? (
              <>
                {' · '}
                <span dir="ltr" className="font-mono">
                  {item.key}
                </span>
              </>
            ) : null}
            {item.images.total
              ? ` · ${item.images.total} picture${item.images.total === 1 ? '' : 's'}${
                  item.images.copied ? `, ${item.images.copied} copied` : ''
                }${item.images.failed ? `, ${item.images.failed} failed` : ''}`
              : ''}
          </p>
        </div>

        <StatusChip tone={outcome.tone}>
          {outcome.word}
          {item.action === 'create' && item.lands ? ` · ${LANDS[item.lands]}` : ''}
        </StatusChip>
      </div>

      {item.reason ? <p className="text-[12px] text-[var(--dash-quiet)]">{item.reason}</p> : null}

      {item.needsYou.length > 0 ? (
        <div>
          <p className="text-[11px] font-semibold">Needs you afterwards</p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 ps-5 text-[12px] leading-relaxed text-[var(--dash-quiet)]">
            {item.needsYou.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  )
}
