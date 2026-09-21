import { useTheme } from '#/frontend/components/theme/theme-provider'
import {
  DashboardPage,
  Initials,
  NotSpecifiedBadge,
  PageHead,
  Panel,
  PanelHead,
  StatusChip,
} from '#/frontend/dashboard/primitives'
import { modulePreviews } from '#/frontend/dashboard/sample-modules'
import {
  useDashboardPreferences,
  type DashboardNavShape,
  type DashboardSurface,
} from '#/frontend/dashboard/preferences'
import { cn } from '#/frontend/lib/utils'
import type { ThemePreference } from '#/frontend/components/theme/theme'

/**
 * The first settings screen that actually does something.
 *
 * Only one section is real: how the dashboard looks. Both of those choices
 * belong to this browser, not to an account, so they need nothing from
 * Backend2 and can exist now — everything below them is still shape.
 */
export function SettingsPage() {
  const preview = modulePreviews.settings

  return (
    <DashboardPage>
      <PageHead
        eyebrow="SETTINGS"
        title="Settings"
        description="How the dashboard looks, and the rest of it once it is designed."
        className="dash-rise dash-rise-1"
      />

      <Panel className="dash-rise dash-rise-2 mt-5">
        <PanelHead title="Appearance" note="Saved in this browser" />

        <div className="border-t border-[var(--dash-soft)] px-5 py-5">
          <SurfaceChoice />
        </div>

        <div className="border-t border-[var(--dash-soft)] px-5 py-5">
          <NavShapeChoice />
        </div>

        <div className="border-t border-[var(--dash-soft)] px-5 py-5">
          <ThemeChoice />
        </div>
      </Panel>

      <div className="dash-rise dash-rise-3 mt-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="dash-eyebrow-quiet">EVERYTHING ELSE</p>
          <p className="mt-1.5 max-w-[68ch] text-[13px] text-[var(--dash-quiet)]">{preview.open}</p>
        </div>
        <NotSpecifiedBadge />
      </div>

      <Panel className="dash-rise dash-rise-4 mt-3 overflow-hidden">
        <ul>
          {preview.rows.map((row, index) => (
            <li
              key={row.id}
              className={cn(
                'flex h-[74px] items-center gap-4 px-5 opacity-70',
                index > 0 && 'border-t border-[var(--dash-soft)]',
              )}
            >
              <Initials className="size-9 rounded-[10px] text-xs">{row.initials}</Initials>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{row.title}</span>
                <span className="mt-0.5 block truncate text-xs text-[var(--dash-quiet)]">
                  {row.detail}
                </span>
              </span>
              <StatusChip tone={row.tone} className="h-6 px-2.5">
                {row.status}
              </StatusChip>
            </li>
          ))}
        </ul>
      </Panel>
    </DashboardPage>
  )
}

/* ── How the surface is built ─────────────────────────────── */

const SURFACE_CHOICES: {
  value: DashboardSurface
  label: string
  description: string
}[] = [
  {
    value: 'flat',
    label: 'Flat',
    description: 'One plane, divided by hairlines. Quieter, and easier on a long day.',
  },
  {
    value: 'floating',
    label: 'Floating',
    description: 'Panels lifted off a tinted ground, each with its own edge and shadow.',
  },
  {
    value: 'framed',
    label: 'Framed',
    description: 'The whole dashboard as one rounded object resting on a page.',
  },
  {
    value: 'detached',
    label: 'Detached',
    description: 'The rail, the bar and the work area as three separate things.',
  },
]

function SurfaceChoice() {
  const { surface, setSurface } = useDashboardPreferences()

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-semibold">Surface</legend>
      <p className="mt-1 max-w-[68ch] text-[13px] text-[var(--dash-quiet)]">
        The same screens, built four ways. Nothing about what they say changes — only
        how the surface underneath them is put together.
      </p>

      <div className="mt-4 grid max-w-[880px] gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SURFACE_CHOICES.map((choice) => {
          const checked = surface === choice.value

          return (
            <label
              key={choice.value}
              className={cn(
                'flex cursor-pointer flex-col gap-3 rounded-xl border p-3 transition-[border-color,box-shadow]',
                checked
                  ? 'border-[var(--dash-blue)] ring-1 ring-[var(--dash-blue)]'
                  : 'border-[var(--dash-line)] hover:border-[var(--dash-quiet)]',
              )}
            >
              <input
                type="radio"
                name="dashboard-surface"
                value={choice.value}
                checked={checked}
                onChange={() => setSurface(choice.value)}
                className="sr-only"
              />

              <SurfacePreview variant={choice.value} />

              <span>
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  {choice.label}
                  {checked ? (
                    <span className="dash-tone-blue rounded px-1.5 py-0.5 text-[10px] font-bold">
                      ON
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-[var(--dash-quiet)]">
                  {choice.description}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/**
 * A small drawing of each surface, rather than a name and a guess.
 *
 * It is built from the same tokens the real thing uses, so it cannot drift
 * away from what it is describing — and it is drawn for the variant it shows,
 * not the one currently switched on, which is the whole point of a preview.
 */
function SurfacePreview({ variant }: { variant: DashboardSurface }) {
  const scale = PREVIEW_SCALE[variant]

  return (
    <span
      aria-hidden="true"
      data-dashboard
      data-surface={variant}
      className="block h-[74px] overflow-hidden rounded-lg border border-[var(--dash-line)]"
      style={{ background: 'var(--dash-page)', padding: scale.pad }}
    >
      <span
        className="flex h-full"
        style={{
          background: 'var(--dash-canvas)',
          borderRadius: scale.frame,
          gap: scale.gap,
          overflow: scale.gap ? 'visible' : 'hidden',
        }}
      >
        <span
          className="w-[18%] shrink-0"
          style={{
            background: 'var(--dash-furniture)',
            borderRadius: scale.part,
            borderRight: scale.gap ? 'none' : '1px solid var(--dash-line)',
          }}
        />

        <span className="flex flex-1 flex-col" style={{ gap: scale.gap }}>
          <span
            className="h-[16%] shrink-0"
            style={{
              background: 'var(--dash-furniture)',
              borderRadius: scale.part,
              borderBottom: scale.gap ? 'none' : '1px solid var(--dash-line)',
            }}
          />

          <span
            className="flex flex-1 flex-col gap-1.5 p-1.5"
            style={{ background: 'var(--dash-main-bg)', borderRadius: scale.part }}
          >
            <span className="dash-card h-[34%]" style={{ background: 'var(--dash-brand)' }} />
            <span className="flex flex-1 gap-1.5">
              <span className="dash-panel flex-1" />
              <span className="dash-panel w-[38%]" />
            </span>
          </span>
        </span>
      </span>
    </span>
  )
}

/* ── How the open section is marked ───────────────────────── */

const NAV_CHOICES: { value: DashboardNavShape; label: string; description: string }[] = [
  {
    value: 'bar',
    label: 'Edge bar',
    description: 'A bar welded to the sidebar\'s edge, with the row tinted behind it.',
  },
  {
    value: 'pill',
    label: 'Filled pill',
    description: 'The row pulled in from both sides and filled with the brand colour.',
  },
]

function NavShapeChoice() {
  const { navShape, setNavShape } = useDashboardPreferences()

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-semibold">Active section</legend>
      <p className="mt-1 max-w-[68ch] text-[13px] text-[var(--dash-quiet)]">
        How the sidebar says which page you are on. Both mark the row with a shape as
        well as a colour, so neither depends on telling the blue from the grey.
      </p>

      <div className="mt-4 grid max-w-[440px] gap-3 sm:grid-cols-2">
        {NAV_CHOICES.map((choice) => {
          const checked = navShape === choice.value

          return (
            <label
              key={choice.value}
              className={cn(
                'flex cursor-pointer flex-col gap-3 rounded-xl border p-3',
                checked
                  ? 'border-[var(--dash-blue)] ring-1 ring-[var(--dash-blue)]'
                  : 'border-[var(--dash-line)] hover:border-[var(--dash-quiet)]',
              )}
            >
              <input
                type="radio"
                name="dashboard-nav-shape"
                value={choice.value}
                checked={checked}
                onChange={() => setNavShape(choice.value)}
                className="sr-only"
              />

              <NavShapePreview variant={choice.value} />

              <span>
                <span className="flex items-center gap-2 text-[13px] font-semibold">
                  {choice.label}
                  {checked ? (
                    <span className="dash-tone-blue rounded px-1.5 py-0.5 text-[10px] font-bold">
                      ON
                    </span>
                  ) : null}
                </span>
                <span className="mt-1 block text-[11px] leading-relaxed text-[var(--dash-quiet)]">
                  {choice.description}
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Three rows of a sidebar, the middle one being the page you are on. */
function NavShapePreview({ variant }: { variant: DashboardNavShape }) {
  const pill = variant === 'pill'

  return (
    <span
      aria-hidden="true"
      data-dashboard
      data-nav={variant}
      className="block h-[74px] overflow-hidden rounded-lg border border-[var(--dash-line)] py-2"
      style={{ background: 'var(--dash-furniture)' }}
    >
      {[false, true, false].map((active, index) => (
        <span
          key={index}
          className="flex h-[18px] items-center gap-2"
          style={{
            marginInline: pill ? 8 : 0,
            marginTop: index === 0 ? 0 : 4,
            paddingInline: pill ? 8 : 10,
            borderRadius: pill ? 6 : 0,
            borderLeft: !pill && active ? '2px solid var(--dash-brand)' : '2px solid transparent',
            background: active
              ? pill
                ? 'var(--dash-brand)'
                : 'var(--dash-blue-tint)'
              : 'transparent',
          }}
        >
          <span
            className="size-[7px] shrink-0 rounded-[2px]"
            style={{
              background: active
                ? pill
                  ? '#ffffff'
                  : 'var(--dash-blue)'
                : 'var(--dash-quiet)',
            }}
          />
          <span
            className="h-[4px] flex-1 rounded-full"
            style={{
              background: active
                ? pill
                  ? 'rgba(255,255,255,0.7)'
                  : 'var(--dash-blue)'
                : 'var(--dash-line)',
            }}
          />
        </span>
      ))}
    </span>
  )
}

/* ── Light or dark ────────────────────────────────────────── */

const PREVIEW_SCALE: Record<DashboardSurface, { pad: number; gap: number; frame: number; part: number }> = {
  flat: { pad: 0, gap: 0, frame: 0, part: 0 },
  floating: { pad: 0, gap: 0, frame: 0, part: 0 },
  framed: { pad: 5, gap: 0, frame: 7, part: 0 },
  detached: { pad: 3, gap: 3, frame: 0, part: 5 },
}

const THEME_CHOICES: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

function ThemeChoice() {
  const { preference, setPreference } = useTheme()

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-semibold">Theme</legend>
      <p className="mt-1 max-w-[68ch] text-[13px] text-[var(--dash-quiet)]">
        Dark is designed on its own rather than inverted from light, so both are
        equally readable. <span className="font-medium text-[var(--dash-ink)]">System</span> follows
        whatever your computer is doing.
      </p>

      <div
        className="mt-4 flex w-fit gap-1 rounded-[10px] p-1"
        style={{ background: 'var(--dash-chip)' }}
      >
        {THEME_CHOICES.map((choice) => (
          <button
            key={choice.value}
            type="button"
            aria-pressed={preference === choice.value}
            data-on={preference === choice.value}
            onClick={() => setPreference(choice.value)}
            className="dash-seg h-8 rounded-[7px] px-4 text-xs"
          >
            {choice.label}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
