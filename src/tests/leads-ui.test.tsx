// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ApiRequestError } from '#/frontend/api/response'
import {
  emptyLeadForm,
  formToFields,
  formatFollowUp,
  isTerminal,
  leadCandidates,
  leadFormErrors,
  serverFieldErrors,
} from '#/frontend/features/leads-v2/lead-form'
import { FollowUpPill, StageChip } from '#/frontend/pages/dashboard/leads/lead-parts'

/**
 * The Leads screens' own rules: what the form accepts before anything is
 * sent, how a follow-up reads in Berlin, and what a stage or a due follow-up
 * looks like — as approved in the Leads Design Lab (23 Sep 2026).
 */

afterEach(cleanup)

const SOURCE = '11111111-1111-4111-8111-111111111111'

const filled = (over: Record<string, unknown> = {}) => ({
  ...emptyLeadForm(),
  name: 'Lina Probe',
  email: 'lina@example.org',
  phone: '+49 30 555 0101',
  country: 'DE',
  sourceId: SOURCE,
  ...over,
})

describe('the Lead form', () => {
  it('starts empty, or with the details a "Create lead" link carried', () => {
    expect(emptyLeadForm()).toMatchObject({ name: '', email: '', country: '', sourceId: '', nicheId: null })
    expect(emptyLeadForm({ name: 'Mara', email: 'mara@example.de' })).toMatchObject({
      name: 'Mara',
      email: 'mara@example.de',
    })
  })

  it('requires name, email, phone, country and source — and says so per field', () => {
    const errors = leadFormErrors(emptyLeadForm())

    expect(Object.keys(errors).sort()).toEqual(['country', 'email', 'name', 'phone', 'sourceId'])
    expect(errors.country).toBe('Choose a country from the list')
    expect(errors.sourceId).toContain('Unknown')
  })

  it('accepts a complete lead, with company and niche optional', () => {
    expect(leadFormErrors(filled())).toEqual({})
    expect(formToFields(filled({ name: '  Lina Probe  ' }))).toMatchObject({
      name: 'Lina Probe',
      company: '',
      nicheId: null,
    })
  })

  it('refuses a phone that is not one', () => {
    expect(leadFormErrors(filled({ phone: 'call me' })).phone).toBeDefined()
    expect(leadFormErrors(filled({ phone: '12' })).phone).toBe('Enter a complete phone number')
  })

  it('reads the server’s refusals back onto the fields', () => {
    const error = new ApiRequestError({
      message: 'That source is hidden',
      code: 'VALIDATION_ERROR',
      status: 422,
      details: { issues: [{ field: 'sourceId', message: 'That source is hidden. Choose another.' }] },
    })

    expect(serverFieldErrors(error)).toEqual({ sourceId: 'That source is hidden. Choose another.' })
    expect(serverFieldErrors(new Error('x'))).toEqual({})
  })

  it('finds the duplicate candidates in a LEAD_DUPLICATE refusal, and only there', () => {
    const candidates = [
      {
        id: 'a',
        name: 'Timo',
        email: 't@example.de',
        phone: '+49',
        stage: 'New',
        inTrash: false,
        matchedOn: ['phone'],
      },
    ]
    const duplicate = new ApiRequestError({
      message: 'dup',
      code: 'LEAD_DUPLICATE',
      status: 409,
      details: { candidates },
    })

    expect(leadCandidates(duplicate)).toEqual(candidates)
    expect(leadCandidates(new ApiRequestError({ message: 'x', code: 'CONFLICT', status: 409 }))).toBeNull()
  })
})

describe('words the screens show', () => {
  it('writes a follow-up as the owner reads it, whatever the browser’s own time zone', () => {
    expect(formatFollowUp({ date: '2026-09-25', time: '10:00' })).toBe('Fri 25 Sept · 10:00')
    expect(formatFollowUp({ date: '2026-03-29', time: '03:30' })).toBe('Sun 29 Mar · 03:30')
  })

  it('knows which stages end a lead', () => {
    expect(isTerminal('won')).toBe(true)
    expect(isTerminal('lost')).toBe(true)
    expect(isTerminal('custom')).toBe(false)
    expect(isTerminal('new')).toBe(false)
  })

  it('never shows a stage or a due follow-up by colour alone', () => {
    render(
      <>
        <StageChip kind="lost" name="Lost" />
        <FollowUpPill
          followUp={{
            id: 'f',
            dueAt: '2026-09-23T08:00:00.000Z',
            date: '2026-09-23',
            time: '10:00',
            note: 'Call',
            status: 'open',
            closedHow: null,
            closedAt: null,
            isDue: true,
          }}
        />
        <FollowUpPill
          followUp={{
            id: 'g',
            dueAt: '2030-01-01T08:00:00.000Z',
            date: '2030-01-01',
            time: '09:00',
            note: '',
            status: 'open',
            closedHow: null,
            closedAt: null,
            isDue: false,
          }}
        />
        <FollowUpPill followUp={null} />
      </>,
    )

    expect(screen.getByText('Lost')).toBeTruthy()
    expect(screen.getByText('Due')).toBeTruthy()
    expect(screen.getByText(/Tue 1 Jan · 09:00/u)).toBeTruthy()
  })
})
