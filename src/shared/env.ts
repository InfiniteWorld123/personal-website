const getEnvVar = (key: string) => {
  const value = process.env[key]
  if (value === undefined || value.trim() === '') {
    throw new Error(`Environment variable ${key} is missing`)
  }
  return value
}

const getOptionalEnvVar = (key: string) => {
  const value = process.env[key]
  if (value === undefined || value.trim() === '') {
    return undefined
  }
  return value
}

export const env = {
  APP_NAME: getOptionalEnvVar('APP_NAME') ?? 'Yaman Warda',

  BETTER_AUTH_SECRET: getEnvVar('BETTER_AUTH_SECRET'),
  BETTER_AUTH_URL: getEnvVar('BETTER_AUTH_URL'),

  DATABASE_URL: getEnvVar('DATABASE_URL'),
  BASE_URL: getEnvVar('BASE_URL'),

  /** Used only by the admin seed command. Never read at request time. */
  ADMIN_NAME: getOptionalEnvVar('ADMIN_NAME'),
  ADMIN_EMAIL: getOptionalEnvVar('ADMIN_EMAIL'),
  ADMIN_PASSWORD: getOptionalEnvVar('ADMIN_PASSWORD'),

  /** Added in later blocks. Optional so B1 runs without them. */
  RESEND_API_KEY: getOptionalEnvVar('RESEND_API_KEY'),
  EMAIL_FROM: getOptionalEnvVar('EMAIL_FROM'),
  /** Where contact-form messages are delivered. Replaced by the leads module in B4. */
  CONTACT_TO_EMAIL: getOptionalEnvVar('CONTACT_TO_EMAIL'),
  CLOUDINARY_CLOUD_NAME: getOptionalEnvVar('CLOUDINARY_CLOUD_NAME'),
  CLOUDINARY_API_KEY: getOptionalEnvVar('CLOUDINARY_API_KEY'),
  CLOUDINARY_API_SECRET: getOptionalEnvVar('CLOUDINARY_API_SECRET'),
} as const

export type EnvVariables = typeof env
