import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/frontend/components/ui/card'

/**
 * Placeholder overview. Real figures arrive with the analytics block (B8);
 * business tables do not exist yet, so nothing is invented here.
 */
const upcomingSections = [
  { title: 'Leads', description: 'Contact form and booking enquiries land here.', block: 'B4' },
  { title: 'Bookings', description: 'Scheduled calls and availability.', block: 'B5' },
  { title: 'Content', description: 'Page copy, projects, and services.', block: 'B6' },
  { title: 'Revenue', description: 'Invoices, payments, and subscriptions.', block: 'B9' },
]

export function OverviewPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          The foundation is in place. Sections activate as their blocks are built.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {upcomingSections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">{section.title}</CardTitle>
                <span className="border-border text-muted-foreground rounded border px-1.5 py-0.5 text-[10px] font-medium">
                  {section.block}
                </span>
              </div>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">Not built yet.</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
