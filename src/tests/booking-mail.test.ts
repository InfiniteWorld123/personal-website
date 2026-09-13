import { describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({ env: { BASE_URL: 'https://yamanwarda.de' } }))

import { manageUrl } from '#/backend/modules/bookings/booking.mail'

describe('booking management link', () => {
  it('uses the noindex management route rather than the booking-type route', () => {
    const url = manageUrl('BK-ABC123', 'token value', 'de')

    expect(url).toContain('/de/booking/manage/BK-ABC123#token=token%20value')
    expect(url).not.toContain('?token=')
  })
})
