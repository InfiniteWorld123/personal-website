import { useState } from 'react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'

/**
 * The strip that asks an editor toolbar's question — a link address, an image
 * path — inside the page rather than in `window.prompt`.
 *
 * It lives here, outside both editors, because the blog and the inbox ask the
 * same question and the answer should look the same in both. The browser's own
 * box was the alternative in the reply editor: it jumps over the page in the
 * browser's font, it cannot be styled, and it says the site's domain back to
 * the person as if the site were warning them about something.
 */
export function EditorPromptBar({
  fields,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  fields: Array<{ name: string; label: string; placeholder: string; value: string }>
  submitLabel: string
  onSubmit: (values: Record<string, string>) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((field) => [field.name, field.value])),
  )

  return (
    <div className="border-border bg-muted/30 flex flex-wrap items-end gap-2 border-b p-2">
      {fields.map((field) => (
        <div key={field.name} className="flex min-w-40 flex-1 flex-col gap-1">
          <label htmlFor={`rt-${field.name}`} className="text-muted-foreground text-xs">
            {field.label}
          </label>
          <Input
            id={`rt-${field.name}`}
            dir="ltr"
            className="h-8"
            value={values[field.name] ?? ''}
            placeholder={field.placeholder}
            autoFocus
            onChange={(event) => setValues({ ...values, [field.name]: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                onSubmit(values)
              }

              if (event.key === 'Escape') onCancel()
            }}
          />
        </div>
      ))}
      <Button type="button" size="sm" className="h-8" onClick={() => onSubmit(values)}>
        {submitLabel}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  )
}
