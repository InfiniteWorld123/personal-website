import * as v from 'valibot'

export const EmailSchema = v.pipe(
  v.string('Email is required'),
  v.trim(),
  v.toLowerCase(),
  v.nonEmpty('Email is required'),
  v.email('Enter a valid email address'),
  v.maxLength(255, 'Email is too long'),
)

export const PasswordSchema = v.pipe(
  v.string('Password is required'),
  v.minLength(12, 'Password must be at least 12 characters'),
  v.maxLength(128, 'Password is too long'),
  v.regex(/[a-z]/, 'Password must contain a lowercase letter'),
  v.regex(/[A-Z]/, 'Password must contain an uppercase letter'),
  v.regex(/[0-9]/, 'Password must contain a number'),
)

export const SignInSchema = v.object({
  email: EmailSchema,
  password: v.pipe(v.string('Password is required'), v.nonEmpty('Password is required')),
})

export type SignInInput = v.InferOutput<typeof SignInSchema>
