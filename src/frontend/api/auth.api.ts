import { createAuthClient } from 'better-auth/client'

export type AuthUser = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  image: string | null
  role: 'ADMIN' | 'USER'
}

type BetterAuthError = {
  code?: string
  message?: string
  status?: number
}

export class AuthRequestError extends Error {
  readonly code: string | null
  readonly status: number | null

  constructor(error: BetterAuthError | null, fallback: string) {
    super(error?.message || fallback)
    this.name = 'AuthRequestError'
    this.code = error?.code ?? null
    this.status = error?.status ?? null
  }
}

const authClient = createAuthClient()

export async function signIn(input: { email: string; password: string }) {
  const { data, error } = await authClient.signIn.email({
    email: input.email,
    password: input.password,
  })

  if (error) throw new AuthRequestError(error, 'Sign in failed')

  return data
}

export async function signOut() {
  const { error } = await authClient.signOut()

  if (error) throw new AuthRequestError(error, 'Sign out failed')
}
