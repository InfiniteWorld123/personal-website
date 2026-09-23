import { useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { AssistantSettings, AssistantUsage } from '#/backend2/contracts/assistant.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, Panel } from '#/frontend/dashboard/primitives'
import { useAssistantSettings, useAssistantUsage, useSaveAssistantSettings } from '#/frontend/features/assistant-v2/queries'
import {
  type RetentionForm,
  retentionFormErrors,
  retentionFormFrom,
  retentionOptions,
  retentionPatch,
  retentionUnchanged,
} from '#/frontend/features/assistant-v2/settings-form'
import { messageFromError, notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { LoadFailure } from '../blog/blog-parts'
import { AMBER_BANNER, AssistantHead, failureText } from './assistant-parts'

/**
 * `/dashboard/assistant/settings`: the chat's on/off switch, how long
 * conversations are kept, and what the chat has used and cost (approved
 * Design Lab, 24 Sep 2026 — retention defaults to "until I delete them",
 * with automatic deletion and the privacy warning beside it).
 */

const USAGE_DAYS = 30

function SectionLabel({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="dash-eyebrow-quiet text-[10.5px]">
      {children}
    </h2>
  )
}

/* ------------------------------------------------------------ on and off */

function ChatSwitch({ settings }: { settings: AssistantSettings }) {
  const save = useSaveAssistantSettings()
  const [failure, setFailure] = useState<string | null>(null)
  const on = settings.enabled

  const toggle = async () => {
    if (save.isPending) return

    setFailure(null)

    try {
      const next = await save.mutateAsync({ enabled: !on })

      notify.success(next.enabled ? 'Chat switched on' : 'Chat switched off')
    } catch (error) {
      setFailure(messageFromError(error))
    }
  }

  return (
    <Panel aria-labelledby="assistant-switch-title" className="gap-3 p-5">
      <SectionLabel id="assistant-switch-title">CHAT ON THE WEBSITE</SectionLabel>
      <div className="flex items-center gap-3 rounded-[10px] border border-[var(--dash-line)] px-3.5 py-3">
        <span className="min-w-0 flex-1 text-[12.5px] text-[var(--dash-quiet)]">
          <b id="assistant-switch-label" className="block text-[13px] text-[var(--dash-ink)]">
            {on ? 'On' : 'Off'}
          </b>
          {on ? 'Visitors can ask it questions on every public page.' : 'Hidden. Visitors see only Contact and Booking.'}
        </span>
        {save.isPending ? <Loader2 className="size-4 animate-spin text-[var(--dash-quiet)]" aria-label="Saving" /> : null}
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Chat on the website"
          disabled={save.isPending}
          onClick={() => void toggle()}
          className={cn(
            'relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none',
            on ? 'bg-[var(--dash-brand)]' : 'bg-[var(--dash-chip)] ring-1 ring-[var(--dash-line)] ring-inset',
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute top-[3px] size-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.25)] transition-[inset-inline-start] motion-reduce:transition-none',
              on ? 'start-[19px]' : 'start-[3px]',
            )}
          />
        </button>
      </div>
      {failure ? (
        <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
          {failure}
        </p>
      ) : null}
      <div className={cn('flex items-start gap-2.5 rounded-[10px] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--dash-ink)]', AMBER_BANNER)}>
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#8a5a00] dark:text-[#ffc766]" aria-hidden="true" />
        <p>
          <b className="block text-[13px]">Before switching it on for real visitors</b>
          Keeping conversations needs a privacy check and a line on the privacy page in all three languages. Until then it
          stays off on the live site.
        </p>
      </div>
    </Panel>
  )
}

/* -------------------------------------------------------------- retention */

function RetentionPanel({ settings }: { settings: AssistantSettings }) {
  const save = useSaveAssistantSettings()
  const [failure, setFailure] = useState<string | null>(null)
  const saved = retentionFormFrom(settings)

  const form = useForm({
    defaultValues: saved,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = retentionFormErrors(value)

        return Object.keys(fields).length ? { fields } : undefined
      },
    },
    onSubmitInvalid: () =>
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-retention-form] [aria-invalid="true"]')?.focus()),
    onSubmit: async ({ value, formApi }) => {
      setFailure(null)

      try {
        const next = await save.mutateAsync(retentionPatch(value))

        formApi.reset(retentionFormFrom(next))
        notify.success(next.retentionMode === 'manual' ? 'Conversations are kept until you delete them' : `Conversations are deleted after ${next.retentionDays} days`)
      } catch (error) {
        const issue =
          error instanceof ApiRequestError
            ? (error.details as { issues?: { field?: string; message?: string }[] } | undefined)?.issues?.find((item) => item.field === 'retentionDays')
            : undefined

        if (issue?.message) formApi.setFieldMeta('retentionDays', (meta) => ({ ...meta, errorMap: { ...meta.errorMap, onServer: issue.message } }))
        setFailure(messageFromError(error))
      }
    },
  })

  return (
    <Panel aria-labelledby="assistant-keep-title" className="p-5">
      <form
        noValidate
        data-retention-form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <SectionLabel id="assistant-keep-title">KEEP CONVERSATIONS</SectionLabel>

        <form.Field name="retentionMode">
          {(mode) => (
            <div role="radiogroup" aria-labelledby="assistant-keep-title" className="flex flex-col gap-2.5">
              <label
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3 text-[13px]',
                  mode.state.value === 'manual' ? 'border-[var(--dash-blue)] bg-[var(--dash-blue-tint)]' : 'border-[var(--dash-line)]',
                )}
              >
                <input
                  type="radio"
                  name="retentionMode"
                  value="manual"
                  className="mt-0.5 accent-[var(--dash-brand)]"
                  checked={mode.state.value === 'manual'}
                  onChange={() => mode.handleChange('manual')}
                />
                <span>
                  <b className="block">Until I delete them</b>
                  <small className="mt-0.5 block text-[12px] text-[var(--dash-quiet)]">
                    Your choice when we planned it. Needs the privacy check before real visitors.
                  </small>
                </span>
              </label>

              <form.Field name="retentionDays">
                {(days) => {
                  const error = days.state.meta.errors[0] as string | undefined
                  const describedBy = ['assistant-days-hint', error ? 'assistant-days-error' : null].filter(Boolean).join(' ')

                  return (
                    <div
                      className={cn(
                        'flex flex-col gap-2 rounded-[10px] border px-3.5 py-3 text-[13px]',
                        mode.state.value === 'days' ? 'border-[var(--dash-blue)] bg-[var(--dash-blue-tint)]' : 'border-[var(--dash-line)]',
                      )}
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="radio"
                          name="retentionMode"
                          value="days"
                          className="mt-0.5 accent-[var(--dash-brand)]"
                          checked={mode.state.value === 'days'}
                          onChange={() => mode.handleChange('days')}
                        />
                        <span>
                          <b className="block">Delete automatically</b>
                          <small id="assistant-days-hint" className="mt-0.5 block text-[12px] text-[var(--dash-quiet)]">
                            Easier to justify under privacy rules. A conversation goes once it has been quiet this long — including ones
                            already saved. The daily counts stay; the text goes.
                          </small>
                        </span>
                      </label>
                      <div className="flex flex-col gap-1 ps-7">
                        <label htmlFor="assistant-days" className="text-[12.5px] font-semibold">
                          Delete after
                        </label>
                        <select
                          id="assistant-days"
                          className="dash-field h-9 w-auto self-start px-2.5 text-[13px]"
                          value={days.state.value}
                          aria-invalid={Boolean(error)}
                          aria-describedby={describedBy}
                          onChange={(event) => {
                            days.handleChange(event.target.value)
                            if (event.target.value !== '' && mode.state.value !== 'days') mode.handleChange('days')
                          }}
                        >
                          <option value="">Choose a period</option>
                          {retentionOptions(days.state.value).map((option) => (
                            <option key={option} value={String(option)}>
                              {option} days
                            </option>
                          ))}
                        </select>
                        {error ? (
                          <span id="assistant-days-error" className="text-[12px] text-[var(--dash-red-ink)]">
                            {error}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )
                }}
              </form.Field>
            </div>
          )}
        </form.Field>

        {failure ? (
          <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
            {failure}
          </p>
        ) : null}

        <form.Subscribe selector={(state) => [state.isSubmitting, state.values] as const}>
          {([submitting, values]) => {
            const unchanged = retentionUnchanged(values as RetentionForm, saved)

            return (
              <div className="flex flex-wrap items-center gap-3 border-t border-[var(--dash-line)] pt-3.5">
                <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting || unchanged}>
                  {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {submitting ? 'Saving…' : 'Save'}
                </button>
                <span className="text-[12px] text-[var(--dash-quiet)]" aria-live="polite">
                  {unchanged ? 'Saved.' : 'Not saved yet.'}
                </span>
              </div>
            )
          }}
        </form.Subscribe>
      </form>
    </Panel>
  )
}

/* ------------------------------------------------------------------- usage */

const euros = (cents: number) =>
  new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100)

export const usageFigures = (usage: AssistantUsage) => {
  const sum = (key: 'conversations' | 'questions' | 'fallbacks') => usage.days.reduce((total, day) => total + day[key], 0)

  return {
    conversations: sum('conversations'),
    questions: sum('questions'),
    unanswered: sum('fallbacks'),
    calls: `${usage.provider.usedToday} / ${usage.provider.dailyCap}`,
    callsLabel: usage.provider.dailyCap === 0 ? 'AI model calls today · none allowed' : 'AI model calls today · daily limit',
    cost: euros(usage.estimatedCostCents),
  }
}

function UsagePanel() {
  const usage = useAssistantUsage(USAGE_DAYS)

  return (
    <Panel aria-labelledby="assistant-usage-title" className="gap-3 p-5">
      <SectionLabel id="assistant-usage-title">LAST {USAGE_DAYS} DAYS</SectionLabel>
      {usage.isPending ? (
        <div aria-busy="true" aria-label="Loading usage" className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <span key={index} className="dash-skeleton h-[68px] rounded-[10px]" />
          ))}
        </div>
      ) : usage.isError ? (
        <LoadFailure title="Usage could not be loaded" message={failureText(messageFromError(usage.error))} onRetry={() => void usage.refetch()} />
      ) : (
        (() => {
          const figures = usageFigures(usage.data)
          const tiles: [string, string][] = [
            [String(figures.conversations), 'conversations'],
            [String(figures.unanswered), 'questions not on the website'],
            [figures.calls, figures.callsLabel],
            [figures.cost, 'cost'],
          ]

          return (
            <>
              <dl className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {tiles.map(([value, label]) => (
                  <div key={label} className="flex flex-col-reverse gap-1 rounded-[10px] border border-[var(--dash-line)] px-3.5 py-3">
                    <dt className="text-[12px] text-[var(--dash-quiet)]">{label}</dt>
                    <dd className="dash-figure text-[22px]">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[12px] leading-relaxed text-[var(--dash-quiet)]">
                {figures.questions} question{figures.questions === 1 ? '' : 's'} in all; the website accepts up to{' '}
                {usage.data.dailyQuestionLimit} a day. It answers by finding the right sentences on your own published pages — no
                paid AI service. A free AI model can be added later with a hard daily limit, only with your approval.
              </p>
            </>
          )
        })()
      )}
    </Panel>
  )
}

/* -------------------------------------------------------------------- page */

export function AssistantSettingsPage() {
  const settings = useAssistantSettings()

  return (
    <DashboardPage className="gap-4">
      <AssistantHead tab="settings" />

      <div className="flex max-w-[52rem] flex-col gap-4">
        {settings.isPending ? (
          <Panel aria-busy="true" aria-label="Loading settings" className="gap-3 p-5">
            <span className="dash-skeleton h-3 w-40 rounded" />
            <span className="dash-skeleton h-14 w-full rounded-[10px]" />
            <span className="dash-skeleton h-14 w-full rounded-[10px]" />
          </Panel>
        ) : settings.isError ? (
          <Panel>
            <LoadFailure title="Settings could not be loaded" message={failureText(messageFromError(settings.error))} onRetry={() => void settings.refetch()} />
          </Panel>
        ) : (
          <>
            <ChatSwitch settings={settings.data} />
            <RetentionPanel settings={settings.data} />
          </>
        )}
        <UsagePanel />
      </div>
    </DashboardPage>
  )
}
