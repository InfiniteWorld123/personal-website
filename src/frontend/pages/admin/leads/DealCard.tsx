import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Panel } from '#/frontend/components/admin/Panel'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/frontend/components/ui/alert-dialog'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { DUE_CLASS, STAGE_CLASS, dueLabel, dueTone, money } from '#/frontend/features/leads/lead-format'
import { useDeleteDeal, useMoveDeal, useUpdateDeal } from '#/frontend/features/leads/lead-queries'
import { cn } from '#/frontend/lib/utils'
import type { Deal } from '#/shared/types/lead.types'
import {
  DEAL_STAGES,
  LOST_REASON_LABEL,
  STAGE_LABEL,
  isOpenStage,
  type DealStage,
} from '#/shared/validation/lead.validation'
import { LostDialog } from './LostDialog'

/**
 * One deal: what it is, what it is worth, and where it is.
 *
 * **The two prices are two fields and are never added together** — the rule
 * `docs/services/Kurzfassung-Ueberblick.pdf` calls «الخطأ الذي يُفلس»: the
 * instalment ends, the subscription does not, and a screen that sums them
 * tells him he earns money that stops arriving in month thirteen.
 *
 * Editing and moving are separate acts with separate buttons, because moving
 * carries rules that a save does not: losing asks why in the same click, and
 * closing a deal drops its follow-up date, since nothing finished is waiting.
 */
export function DealCard({
  personId,
  personName,
  deal,
}: {
  personId: string
  /** The human, for the question the lost dialog asks about them. */
  personName: string
  deal: Deal
}) {
  const update = useUpdateDeal(personId)
  const move = useMoveDeal(personId)
  const remove = useDeleteDeal(personId)

  const [title, setTitle] = useState(deal.title)
  const [build, setBuild] = useState(String(deal.buildCents / 100))
  const [monthly, setMonthly] = useState(String(deal.monthlyCents / 100))
  const [nextStep, setNextStep] = useState(deal.nextStep)
  const [followUpOn, setFollowUpOn] = useState(deal.followUpOn ?? '')
  const [isLostOpen, setIsLostOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  /*
   * When the server changes the deal underneath the fields, the fields follow.
   *
   * Winning a deal clears its follow-up date in the same write. Without this,
   * the date input kept yesterday's value, the card counted itself as edited,
   * and a Save button appeared offering a write the server refuses outright —
   * "a won deal is not waiting for anything" — in front of him, for doing
   * nothing wrong. Compared by value rather than by object identity, so a
   * refetch that changes nothing never interrupts his typing.
   */
  const fromServer = `${deal.stage}|${deal.title}|${deal.buildCents}|${deal.monthlyCents}|${deal.nextStep}|${deal.followUpOn ?? ''}`
  const [seen, setSeen] = useState(fromServer)

  if (seen !== fromServer) {
    setSeen(fromServer)
    setTitle(deal.title)
    setBuild(String(deal.buildCents / 100))
    setMonthly(String(deal.monthlyCents / 100))
    setNextStep(deal.nextStep)
    setFollowUpOn(deal.followUpOn ?? '')
  }

  const open = isOpenStage(deal.stage)
  const dirty =
    title !== deal.title ||
    build !== String(deal.buildCents / 100) ||
    monthly !== String(deal.monthlyCents / 100) ||
    nextStep !== deal.nextStep ||
    followUpOn !== (deal.followUpOn ?? '')

  const save = () =>
    update.mutate({
      dealId: deal.id,
      title: title.trim() === '' ? deal.title : title,
      buildEuros: build === '' ? 0 : Number(build),
      monthlyEuros: monthly === '' ? 0 : Number(monthly),
      nextStep,
      followUpOn: followUpOn === '' ? null : followUpOn,
    })

  return (
    /* A panel inside a panel: the same surface, one step quieter — no brand
       shadow, and a smaller radius, so a deal reads as a thing *in* the deals
       block rather than a second block beside it. */
    <Panel asChild className="bg-background rounded-2xl p-4 shadow-none">
      <article>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'rounded-full border px-2 py-0.5 text-[10px] font-medium',
              STAGE_CLASS[deal.stage],
            )}
          >
            {STAGE_LABEL[deal.stage]}
          </span>

          {deal.stage === 'LOST' && deal.lostReason ? (
            <span dir="auto" className="text-muted-foreground text-xs">
              {LOST_REASON_LABEL[deal.lostReason]}
              {deal.lostNote ? ` — ${deal.lostNote}` : ''}
            </span>
          ) : null}

          {open && deal.followUpOn ? (
            <span className={cn('text-xs', DUE_CLASS[dueTone(deal.followUpOn)])}>
              {dueLabel(deal.followUpOn)}
            </span>
          ) : null}

          <span className="text-muted-foreground ms-auto text-xs tabular-nums">
            {money(deal.buildCents, deal.currency)} once
            {deal.monthlyCents > 0 ? (
              <span className="text-emerald-600 dark:text-emerald-400">
                {' · '}
                {money(deal.monthlyCents, deal.currency)} a month
              </span>
            ) : null}
          </span>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="What it is" id={`title-${deal.id}`}>
            <Input
              id={`title-${deal.id}`}
              dir="auto"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </Field>

          <Field label="Next step" id={`next-${deal.id}`}>
            <Input
              id={`next-${deal.id}`}
              dir="auto"
              value={nextStep}
              placeholder="One line: what you must do"
              onChange={(event) => setNextStep(event.currentTarget.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Build, once (€)" id={`build-${deal.id}`}>
              <Input
                id={`build-${deal.id}`}
                type="number"
                min="0"
                step="10"
                inputMode="numeric"
                className="tabular-nums"
                value={build}
                onChange={(event) => setBuild(event.currentTarget.value)}
              />
            </Field>

            <Field label="Monthly (€)" id={`monthly-${deal.id}`}>
              <Input
                id={`monthly-${deal.id}`}
                type="number"
                min="0"
                step="10"
                inputMode="numeric"
                className="tabular-nums"
                value={monthly}
                onChange={(event) => setMonthly(event.currentTarget.value)}
              />
            </Field>
          </div>

          <Field
            label="Follow up on"
            id={`due-${deal.id}`}
            hint={open ? undefined : 'A closed deal waits for nothing'}
          >
            <Input
              id={`due-${deal.id}`}
              type="date"
              disabled={!open}
              value={followUpOn}
              onChange={(event) => setFollowUpOn(event.currentTarget.value)}
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {dirty ? (
            <Button size="sm" onClick={save} disabled={update.isPending}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          ) : null}

          {open
            ? DEAL_STAGES.filter((stage) => stage !== deal.stage && stage !== 'LOST').map((stage) => (
                <Button
                  key={stage}
                  size="sm"
                  variant={stage === 'WON' ? 'default' : 'outline'}
                  disabled={move.isPending}
                  onClick={() => move.mutate({ dealId: deal.id, stage, lostReason: null, lostNote: '' })}
                >
                  {stage === 'WON' ? 'Won' : `Move to ${STAGE_LABEL[stage].toLowerCase()}`}
                </Button>
              ))
            : null}

          {open ? (
            <Button
              size="sm"
              variant="outline"
              className="text-rose-600 dark:text-rose-400"
              onClick={() => setIsLostOpen(true)}
            >
              Lost…
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={move.isPending}
              onClick={() =>
                move.mutate({ dealId: deal.id, stage: 'TALKING', lostReason: null, lostNote: '' })
              }
            >
              Reopen
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground ms-auto"
            aria-label="Delete this deal"
            onClick={() => setIsDeleteOpen(true)}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        </div>

        {update.isError || move.isError || remove.isError ? (
          <p role="alert" className="text-destructive mt-2 text-sm">
            {((update.error ?? move.error ?? remove.error) as Error).message}
          </p>
        ) : null}

        <LostDialog
          open={isLostOpen}
          onOpenChange={setIsLostOpen}
          personName={personName}
          pending={move.isPending}
          onConfirm={(reason, note) =>
            move.mutate(
              { dealId: deal.id, stage: 'LOST', lostReason: reason, lostNote: note },
              { onSuccess: () => setIsLostOpen(false) },
            )
          }
        />

        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this deal?</AlertDialogTitle>
              <AlertDialogDescription>
                The deal goes; the line in the history saying it existed stays. Letters, files and
                calls are untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={() => remove.mutate(deal.id)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </article>
    </Panel>
  )
}

function Field({
  label,
  id,
  hint,
  children,
}: {
  label: string
  id: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-muted-foreground text-[10px] tracking-widest uppercase">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-muted-foreground text-[11px]">{hint}</p> : null}
    </div>
  )
}

export type { DealStage }
