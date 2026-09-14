import { cn } from '#/frontend/lib/utils'
import type { PipelineStats } from '#/shared/types/pipeline.types'
import type { LeadPreferences } from '#/shared/validation/pipeline.validation'
import { formatMoney, LOST_REASON_LABEL, SOURCE_LABEL } from './pipeline-format'

/**
 * Every figure comes from the owner's own tables, live.
 *
 * Nothing is cached: these are counts over hundreds of rows, not the
 * third-party traffic numbers `data-model.md` reserves a snapshot table for.
 * Each tile is a switch on the settings page.
 */
export function PipelineNumbers({
  stats,
  preferences,
}: {
  stats: PipelineStats
  preferences: LeadPreferences
}) {
  const { numbers } = preferences
  const tiles = [
    numbers.pipeline && (
      <Tile
        key="pipeline"
        label="Pipeline"
        value={formatMoney(stats.weightedCents, stats.currency)}
        note={`weighted · ${formatMoney(stats.rawCents, stats.currency)} raw · ${stats.openCount} open`}
      />
    ),
    numbers.won && (
      <Tile
        key="won"
        label="Won"
        value={formatMoney(stats.wonCents, stats.currency)}
        note={`${stats.wonCount} ${stats.wonCount === 1 ? 'project' : 'projects'}`}
      />
    ),
    numbers.conversion && (
      <Tile
        key="conversion"
        label="Conversion"
        value={stats.conversion === null ? '—' : `${stats.conversion}%`}
        note={
          stats.conversion === null
            ? 'nothing closed yet'
            : `${stats.wonCount} won of ${stats.wonCount + stats.lostCount} closed`
        }
      />
    ),
    numbers.replyTime && (
      <Tile
        key="reply"
        label="First reply"
        value={stats.medianReplyHours === null ? '—' : `${stats.medianReplyHours}h`}
        note={
          stats.awaitingReply > 0
            ? `median · ${stats.awaitingReply} still waiting`
            : 'median · nobody waiting'
        }
      />
    ),
  ].filter(Boolean)

  const bars = [
    numbers.bySource && stats.bySource.length > 0 && (
      <Bars
        key="source"
        label="Where they come from"
        rows={stats.bySource.map((row) => ({
          name: SOURCE_LABEL[row.source],
          total: row.total,
          value: `${row.won}/${row.total}`,
        }))}
      />
    ),
    numbers.byService && stats.byService.length > 0 && (
      <Bars
        key="service"
        label="By service"
        rows={stats.byService.map((row) => ({
          name: row.service.name,
          total: row.total,
          value: formatMoney(row.openCents, stats.currency),
          accent: row.service.accent,
        }))}
      />
    ),
    numbers.lost && stats.byLostReason.length > 0 && (
      <Bars
        key="lost"
        label="Why I lose"
        rows={stats.byLostReason.map((row) => ({
          name: LOST_REASON_LABEL[row.reason],
          total: row.count,
          value: String(row.count),
          accent: 'var(--color-destructive)',
        }))}
      />
    ),
  ].filter(Boolean)

  if (tiles.length === 0 && bars.length === 0) return null

  return (
    <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
      {tiles}
      {bars}
    </div>
  )
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-card rounded-lg border p-3">
      <p className="text-muted-foreground text-[0.62rem] font-medium tracking-wider uppercase">{label}</p>
      <p className="font-heading mt-0.5 text-lg font-semibold">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-[0.68rem]">{note}</p>
    </div>
  )
}

function Bars({
  label,
  rows,
}: {
  label: string
  rows: Array<{ name: string; total: number; value: string; accent?: string }>
}) {
  const most = Math.max(1, ...rows.map((row) => row.total))

  return (
    <div className={cn('bg-card rounded-lg border p-3', 'col-span-2')}>
      <p className="text-muted-foreground text-[0.62rem] font-medium tracking-wider uppercase">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.name} className="text-muted-foreground flex items-center gap-2 text-[0.68rem]">
            <span
              aria-hidden="true"
              className="block h-1.5 shrink-0 rounded-full"
              style={{
                width: `${Math.round((row.total / most) * 48) + 8}px`,
                backgroundColor: row.accent ?? 'var(--color-primary)',
              }}
            />
            <span className="truncate">{row.name}</span>
            <span className="text-foreground ms-auto font-medium">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
