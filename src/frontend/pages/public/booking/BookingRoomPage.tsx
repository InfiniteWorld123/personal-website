import { ApiRequestError } from '#/frontend/api/response'
import { Container } from '#/frontend/components/layout/public/Container'
import { CallRoom } from '#/frontend/features/call/CallRoom'
import { callCopy } from '#/frontend/features/call/call-copy'
import { useJoinCallAsVisitor } from '#/frontend/features/call/call-queries'
import { useLanguage } from '#/frontend/i18n/language-provider'

/**
 * The visitor's way into their own call.
 *
 * Reached from the link already in their confirmation email — the same token
 * that cancels and reschedules, read from the URL fragment so it never reaches
 * a server log. There is no account here and there is not going to be one.
 *
 * The camera opens for the preview, and the room only once the button is
 * pressed. Nothing is sent anywhere in between.
 */
export function BookingRoomPage({ reference, token }: { reference: string; token: string }) {
  const { language } = useLanguage()
  const copy = callCopy[language]
  const join = useJoinCallAsVisitor(reference, token)

  const error =
    token.length === 0
      ? copy.errors.incompleteLink
      : join.error
        ? join.error instanceof ApiRequestError
          ? join.error.message
          : copy.errors.couldNotOpen
        : null

  return (
    <main className="py-12">
      <Container>
        <CallRoom
          copy={copy}
          access={join.data ?? null}
          joining={join.isPending}
          joinError={error}
          onJoin={() => {
            if (token.length > 0) join.mutate()
          }}
          onClose={() => join.reset()}
        />
      </Container>
    </main>
  )
}
