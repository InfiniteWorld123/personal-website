import { PlusIcon, XIcon } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { PROJECT_LANGUAGES, type ProjectLanguage } from '#/shared/validation/project.validation'
import type { ProjectImageFormValue } from './project-form-values'

const LANGUAGE_LABELS: Record<ProjectLanguage, string> = {
  de: 'German',
  en: 'English',
  ar: 'Arabic',
}

const blankImage = (): ProjectImageFormValue => ({
  src: '',
  width: 1600,
  height: 1000,
  isCover: false,
  alt: { de: '', en: '', ar: '' },
})

/**
 * Images are still referenced by path; uploading them is its own block. The
 * dimensions are entered rather than measured for the same reason — the file
 * is not in the browser here, only its address.
 */
export function ProjectImagesField({
  values,
  onChange,
}: {
  values: ProjectImageFormValue[]
  onChange: (next: ProjectImageFormValue[]) => void
}) {
  const patch = (index: number, changes: Partial<ProjectImageFormValue>) =>
    onChange(values.map((image, position) => (position === index ? { ...image, ...changes } : image)))

  /** Exactly one cover: choosing a new one takes the flag off the old one. */
  const chooseCover = (index: number) =>
    onChange(values.map((image, position) => ({ ...image, isCover: position === index })))

  return (
    <div className="flex flex-col gap-4">
      {values.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No images yet. The cover image is what the project card shows on the work page.
        </p>
      ) : null}

      {values.map((image, index) => (
        <div key={index} className="border-border flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium">Image {index + 1}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove image ${index + 1}`}
              onClick={() => onChange(values.filter((_image, position) => position !== index))}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_7rem_7rem]">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`image-src-${index}`}>Path</Label>
              <Input
                id={`image-src-${index}`}
                value={image.src}
                placeholder="/images/work/example/home.jpg"
                onChange={(event) => patch(index, { src: event.target.value })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`image-width-${index}`}>Width</Label>
              <Input
                id={`image-width-${index}`}
                type="number"
                min={1}
                value={image.width}
                onChange={(event) => patch(index, { width: Number(event.target.value) })}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`image-height-${index}`}>Height</Label>
              <Input
                id={`image-height-${index}`}
                type="number"
                min={1}
                value={image.height}
                onChange={(event) => patch(index, { height: Number(event.target.value) })}
              />
            </div>
          </div>

          <label className="flex w-fit items-center gap-2 text-sm">
            <input
              type="radio"
              name="project-cover"
              checked={image.isCover}
              onChange={() => chooseCover(index)}
              className="accent-primary size-4"
            />
            Cover image
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            {PROJECT_LANGUAGES.map((language) => (
              <div key={language} className="flex flex-col gap-2">
                <Label htmlFor={`image-alt-${index}-${language}`}>
                  {LANGUAGE_LABELS[language]} alt text
                </Label>
                <Input
                  id={`image-alt-${index}-${language}`}
                  value={image.alt[language]}
                  onChange={(event) =>
                    patch(index, { alt: { ...image.alt, [language]: event.target.value } })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...values, blankImage()])}
        >
          <PlusIcon aria-hidden="true" />
          Add image
        </Button>
      </div>
    </div>
  )
}
