// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EmailLinkDialog, emailLinkHref } from '#/frontend/features/inbox-v2/EmailLinkDialog'
import { ToolbarButton } from '#/frontend/features/projects/CaseStudyEditor'

afterEach(() => cleanup())

describe('email editor controls', () => {
  it('activates formatting through a keyboard click, preserving selection on mouse press', () => {
    const command = vi.fn()
    render(<ToolbarButton label="Bold" icon="B" onClick={command} />)
    const button = screen.getByRole('button', { name: 'Bold' })
    // Keyboard activation dispatches click without a mousedown.
    fireEvent.click(button, { detail: 0 })
    expect(command).toHaveBeenCalledTimes(1)
    expect(fireEvent.mouseDown(button)).toBe(false)
    expect(command).toHaveBeenCalledTimes(1)
    fireEvent.click(button, { detail: 1 })
    expect(command).toHaveBeenCalledTimes(2)
  })

  it('accepts a bare domain and selected text in the link form', async () => {
    const apply = vi.fn()
    render(<EmailLinkDialog text="Read the offer" href="" onApply={apply} onClose={() => {}} />)
    expect(screen.queryByText(/Enter a website address/u)).toBeNull()
    fireEvent.change(screen.getByLabelText('Link address'), { target: { value: 'example.com/offer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Insert link' }))
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith({ text: 'Read the offer', href: 'https://example.com/offer' }))
  })

  it('shows unsafe link errors after submit and clears them while correcting the address', async () => {
    const apply = vi.fn()
    render(<EmailLinkDialog text="" href="" onApply={apply} onClose={() => {}} />)
    const address = screen.getByLabelText('Link address')
    fireEvent.change(address, { target: { value: 'javascript:alert(1)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Insert link' }))
    expect(await screen.findByText(/Enter a website address/u)).toBeTruthy()
    expect(address.getAttribute('aria-invalid')).toBe('true')
    expect(address.getAttribute('aria-describedby')).toBe('email-link-error')
    expect(document.activeElement).toBe(address)
    expect(apply).not.toHaveBeenCalled()
    fireEvent.change(address, { target: { value: 'https://example.com' } })
    await vi.waitFor(() => expect(address.getAttribute('aria-invalid')).toBe('false'))
    fireEvent.click(screen.getByRole('button', { name: 'Insert link' }))
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith({ text: 'https://example.com', href: 'https://example.com' }))
  })

  it.each(['/relative', '//example.com', 'data:text/html,test', 'https://user:pass@example.com', 'mail to@example.com', 'mailto:'])('rejects unsafe or ambiguous email link %s', (href) => {
    expect(emailLinkHref(href)).toBeNull()
  })
})
