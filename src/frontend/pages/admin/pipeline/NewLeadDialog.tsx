import { useState } from 'react'
import { Button } from '#/frontend/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/frontend/components/ui/dialog'
import { Input } from '#/frontend/components/ui/input'
import { Textarea } from '#/frontend/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/frontend/components/ui/select'
import { useCreateLeadByHand } from '#/frontend/features/pipeline/pipeline-queries'
import type { PipelineService } from '#/shared/types/pipeline.types'
import { LEAD_CHANNELS, type LeadChannel, type LeadPreferences } from '#/shared/validation/pipeline.validation'
import { CHANNEL_LABEL, formatMoney } from './pipeline-format'

/**
 * Someone met at a fair, or writing on WhatsApp.
 *
 * `source = MANUAL` has been a legal value since the bookings migration and
 * nothing ever wrote it. A lead system that only accepts what its own form
 * catches misses half of what actually happens to a freelancer.
 */
export function NewLeadDialog({
  open,
  services,
  preferences,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  services: PipelineService[]
  preferences: LeadPreferences
  onOpenChange: (open: boolean) => void
  onCreated: (id: string) => void
}) {
  const create = useCreateLeadByHand()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [serviceId, setServiceId] = useState<string>('none')
  const [value, setValue] = useState('')
  const [channel, setChannel] = useState<LeadChannel>('REFERRAL')
  const [note, setNote] = useState('')
  const [allowDuplicate, setAllowDuplicate] = useState(false)

  const service = services.find((candidate) => candidate.id === serviceId)
  const duplicate = create.error instanceof Error && create.error.message.includes('already exists')

  const reset = () => {
    setName('')
    setEmail('')
    setCompany('')
    setServiceId('none')
    setValue('')
    setChannel('REFERRAL')
    setNote('')
    setAllowDuplicate(false)
    create.reset()
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()

    create.mutate(
      {
        name,
        email,
        company,
        phone: '',
        note,
        language: 'de',
        serviceId: serviceId === 'none' ? null : serviceId,
        // Blank means "take what the service suggests", which is the point of
        // the vocabulary: adding someone is four fields, not a form.
        valueCents: value === '' ? null : Number(value) * 100,
        channel,
        followUpOn: null,
        allowDuplicate,
      },
      {
        onSuccess: ({ lead }) => {
          reset()
          onOpenChange(false)
          onCreated(lead.id)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New lead</DialogTitle>
            <DialogDescription>Someone who reached you outside the site.</DialogDescription>
          </DialogHeader>

          <DialogBody className="grid gap-3 py-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <Input value={name} onChange={(event) => setName(event.target.value)} required autoFocus />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </Field>
            </div>

            <Field label="Company">
              <Input value={company} onChange={(event) => setCompany(event.target.value)} />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Service">
                <Select value={serviceId} onValueChange={setServiceId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not set</SelectItem>
                    {services.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name} — from {formatMoney(candidate.startPriceCents, candidate.currency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Worth">
                <Input
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ''))}
                  placeholder={
                    service ? String(Math.round(service.startPriceCents / 100)) : 'from the service'
                  }
                />
              </Field>
            </div>

            {preferences.manual.channelField ? (
              <Field label="How they reached me">
                <Select value={channel} onValueChange={(next) => setChannel(next as LeadChannel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_CHANNELS.map((candidate) => (
                      <SelectItem key={candidate} value={candidate}>
                        {CHANNEL_LABEL[candidate]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <Field label="Note">
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
                placeholder="What they asked for…"
              />
            </Field>

            {create.error ? (
              <p
                className={
                  duplicate
                    ? 'rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300'
                    : 'border-destructive/40 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-xs'
                }
              >
                {create.error.message}
                {duplicate && !allowDuplicate ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ms-2 h-6"
                    onClick={() => setAllowDuplicate(true)}
                  >
                    Add anyway
                  </Button>
                ) : null}
              </p>
            ) : null}
          </DialogBody>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : allowDuplicate ? 'Add anyway' : 'Add lead'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-[0.7rem] font-medium tracking-wider uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}
