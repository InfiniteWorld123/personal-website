import { useQuery } from '@tanstack/react-query'
import { overdueQuery } from './lead-queries'

/**
 * How many follow-ups are past their day, on the sidebar.
 *
 * It shows nothing at all when the number is zero, and nothing when the count
 * cannot be read — a badge that renders "0" or "!" trains him to ignore it,
 * and a badge he ignores is worse than none. The only state worth a red dot is
 * "somebody is waiting and you said you would write".
 */
export function LeadsOverdueBadge() {
  const overdue = useQuery(overdueQuery())

  if (!overdue.data) return null

  return (
    <span
      aria-label={`${overdue.data} overdue`}
      className="ms-auto grid min-w-4.5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white tabular-nums"
    >
      {overdue.data}
    </span>
  )
}
