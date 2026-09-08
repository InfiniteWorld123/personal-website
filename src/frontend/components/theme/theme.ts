export const themePreferences = ['light', 'dark', 'system'] as const

export type ThemePreference = (typeof themePreferences)[number]

/** Storage key is shared with the SSR inline script in __root.tsx. */
export const THEME_STORAGE_KEY = 'theme-preference'

export const defaultThemePreference: ThemePreference = 'light'

export const isThemePreference = (value: unknown): value is ThemePreference =>
  typeof value === 'string' && (themePreferences as readonly string[]).includes(value)
