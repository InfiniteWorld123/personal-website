import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'

/**
 * An ordered list of short strings — technologies, feature bullets. Controlled
 * on purpose: the form owns the array so a whole project still saves in one
 * request.
 */
export function StringListField({
  id,
  label,
  description,
  placeholder,
  addLabel,
  values,
  onChange,
}: {
  id: string
  label: string
  description?: string
  placeholder?: string
  addLabel: string
  values: string[]
  onChange: (next: string[]) => void
}) {
  const replace = (index: number, value: string) =>
    onChange(values.map((entry, position) => (position === index ? value : entry)))

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`${id}-0`}>{label}</Label>
      {description ? <p className="text-muted-foreground text-xs">{description}</p> : null}

      {values.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing added yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {values.map((value, index) => (
            // The index is the identity here: these are plain strings in a
            // list the owner reorders by editing, and two may be equal.
            <li key={index} className="flex items-center gap-2">
              <Input
                id={`${id}-${index}`}
                value={value}
                placeholder={placeholder}
                onChange={(event) => replace(index, event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove entry ${index + 1}`}
                onClick={() => onChange(values.filter((_entry, position) => position !== index))}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ''])}>
          <PlusIcon aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
    </div>
  )
}
