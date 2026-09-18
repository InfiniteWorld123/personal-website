import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/frontend/components/ui/alert-dialog'
import { Textarea } from '#/frontend/components/ui/textarea'
import { cn } from '#/frontend/lib/utils'
import { LOST_REASONS, LOST_REASON_LABEL, type LostReason } from '#/shared/validation/lead.validation'

/**
 * Losing a deal, and saying why, in one act.
 *
 * The database refuses a lost deal without a reason — `deals_lost_pair_check`
 * in `0015` — because the two are one fact. A screen that let him mark
 * something lost and then asked separately is how the last system produced a
 * 500 in front of him.
 *
 * Six reasons rather than a text box: six can be counted, and "most often:
 * too expensive" is the only number in this section that tells him something
 * about his own offer. The sentence he wants to add anyway rides along beside
 * the code, not instead of it.
 */
export function LostDialog({
  open,
  onOpenChange,
  personName,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  personName: string
  pending: boolean
  onConfirm: (reason: LostReason, note: string) => void
}) {
  const [reason, setReason] = useState<LostReason | null>(null)
  const [note, setNote] = useState('')

  const close = (next: boolean) => {
    if (!next) {
      setReason(null)
      setNote('')
    }

    onOpenChange(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Why was it lost?</AlertDialogTitle>
          <AlertDialogDescription>
            Pick one. After ten of these, the answer tells you what to change about the offer
            you make to people like {personName}.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5">
          {LOST_REASONS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setReason(value)}
              aria-pressed={reason === value}
              className={cn(
                'border-border focus-visible:ring-ring rounded-xl border px-3 py-2 text-start text-sm motion-safe:transition-colors focus-visible:ring-2 focus-visible:outline-none',
                reason === value
                  ? 'border-primary bg-primary/10 font-medium'
                  : 'hover:border-foreground/25',
              )}
            >
              {LOST_REASON_LABEL[value]}
            </button>
          ))}
        </div>

        <Textarea
          rows={2}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          placeholder="In your words, if a code is not enough (optional)"
          aria-label="What happened, in your words"
        />

        <AlertDialogFooter>
          <AlertDialogCancel>Keep it open</AlertDialogCancel>
          {/* Not an AlertDialogAction: that closes the dialog on click, and a
              move with no reason picked must not close anything — the button
              is simply unavailable until the question is answered. */}
          <button
            type="button"
            disabled={reason === null || pending}
            onClick={() => reason && onConfirm(reason, note)}
            className="bg-destructive text-destructive-foreground focus-visible:ring-ring h-9 rounded-md px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            {pending ? 'Marking…' : 'Mark as lost'}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
