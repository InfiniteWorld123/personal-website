import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('#/frontend/lib/notify', () => ({
  notify: { error: vi.fn() },
  messageFromError: (error: unknown) => (error instanceof Error ? error.message : 'Something went wrong'),
}))

const { notify } = await import('#/frontend/lib/notify')
const { toastMutationFailure } = await import('#/frontend/config/mutation-errors')

afterEach(() => vi.mocked(notify.error).mockClear())

describe('the failed-write toast', () => {
  it('says every failure once', () => {
    toastMutationFailure(new Error('The time was taken'), { meta: undefined })
    expect(notify.error).toHaveBeenCalledWith('The time was taken')
  })

  it('stays quiet only where the page already shows the failure', () => {
    toastMutationFailure(new Error('The video service is not available right now.'), { meta: { toast: false } })
    toastMutationFailure(new Error('x'), { meta: { other: true } })
    expect(notify.error).toHaveBeenCalledTimes(1)
    expect(notify.error).toHaveBeenCalledWith('x')
  })
})
