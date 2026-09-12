import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { ApiRequestError } from '#/frontend/api/project.api'
import { Button } from '#/frontend/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/frontend/components/ui/card'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/frontend/components/ui/select'
import { Switch } from '#/frontend/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/frontend/components/ui/tabs'
import { Textarea } from '#/frontend/components/ui/textarea'
import type { AdminProjectDetail } from '#/shared/types/project.types'
import {
  PROJECT_LANGUAGES,
  type ProjectLanguage,
  type ProjectStatus,
  missingPublishRequirements,
} from '#/shared/validation/project.validation'
import { ProjectImagesField } from './ProjectImagesField'
import { StringListField } from './StringListField'
import { type ProjectFormValues, toWriteInput } from './project-form-values'

const LANGUAGE_LABELS: Record<ProjectLanguage, string> = {
  de: 'German',
  en: 'English',
  ar: 'Arabic',
}

/** Mirrors the headings the public case study renders, in the same order. */
const COPY_FIELDS = [
  { name: 'kind', label: 'Kind', hint: 'Online store, blogging platform, …', long: false },
  { name: 'summary', label: 'Summary', hint: 'One or two sentences for the card.', long: true },
  { name: 'problem', label: 'Starting point', hint: 'What made this hard.', long: true },
  { name: 'approach', label: 'What I built', hint: 'What was actually delivered.', long: true },
  { name: 'shows', label: 'What the project shows', hint: 'What it proves you can do.', long: true },
] as const

export function ProjectForm({
  initialValues,
  isNew,
  isSaving,
  onSubmit,
  onCancel,
}: {
  initialValues: ProjectFormValues
  isNew: boolean
  isSaving: boolean
  onSubmit: (values: ProjectFormValues) => Promise<AdminProjectDetail>
  onCancel: () => void
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldIssues, setFieldIssues] = useState<string[]>([])

  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      setErrorMessage(null)
      setFieldIssues([])

      try {
        await onSubmit(value)
      } catch (error) {
        if (error instanceof ApiRequestError) {
          setErrorMessage(error.message)

          const details = error.details as
            | { missing?: string[]; issues?: Array<{ field?: string; message: string }> }
            | undefined

          setFieldIssues(
            details?.missing ??
              details?.issues?.map((issue) =>
                issue.field ? `${issue.field}: ${issue.message}` : issue.message,
              ) ??
              [],
          )

          return
        }

        setErrorMessage('Something went wrong while saving.')
      }
    },
  })

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
          <CardDescription>Facts that are the same in every language.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <form.Field name="slug">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="slug">URL slug</Label>
                <Input
                  id="slug"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="tech-store"
                />
                <p className="text-muted-foreground text-xs">
                  The address becomes /de/work/{field.state.value || 'slug'}. Changing it breaks
                  existing links.
                </p>
              </div>
            )}
          </form.Field>

          <form.Field name="status">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={field.state.value}
                  onValueChange={(value) => field.handleChange(value as ProjectStatus)}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live</SelectItem>
                    <SelectItem value="building">In progress</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>

          <form.Field name="websiteUrl">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="websiteUrl">Website</Label>
                <Input
                  id="websiteUrl"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="https://example.com"
                />
              </div>
            )}
          </form.Field>

          <form.Field name="sourceUrl">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="sourceUrl">Source code</Label>
                <Input
                  id="sourceUrl"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="https://github.com/…"
                />
              </div>
            )}
          </form.Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Case study</CardTitle>
          <CardDescription>
            One tab per language. A tab with no name is treated as not written yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="de">
            <TabsList>
              <form.Subscribe selector={(state) => state.values.translations}>
                {(translations) =>
                  PROJECT_LANGUAGES.map((language) => (
                    <TabsTrigger key={language} value={language}>
                      {LANGUAGE_LABELS[language]}
                      {translations[language].name.trim() === '' ? (
                        <span className="text-muted-foreground ms-2 text-xs">empty</span>
                      ) : null}
                    </TabsTrigger>
                  ))
                }
              </form.Subscribe>
            </TabsList>

            {PROJECT_LANGUAGES.map((language) => (
              <TabsContent key={language} value={language} className="flex flex-col gap-4 pt-4">
                <form.Field name={`translations.${language}.name`}>
                  {(field) => (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`${language}-name`}>Name</Label>
                      <Input
                        id={`${language}-name`}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                    </div>
                  )}
                </form.Field>

                {COPY_FIELDS.map((copyField) => (
                  <form.Field key={copyField.name} name={`translations.${language}.${copyField.name}`}>
                    {(field) => (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`${language}-${copyField.name}`}>{copyField.label}</Label>
                        {copyField.long ? (
                          <Textarea
                            id={`${language}-${copyField.name}`}
                            rows={4}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                          />
                        ) : (
                          <Input
                            id={`${language}-${copyField.name}`}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                          />
                        )}
                        <p className="text-muted-foreground text-xs">{copyField.hint}</p>
                      </div>
                    )}
                  </form.Field>
                ))}

                <form.Field name={`translations.${language}.features`}>
                  {(field) => (
                    <StringListField
                      id={`${language}-features`}
                      label="Features"
                      description="The bullet list under the case study."
                      addLabel="Add feature"
                      values={field.state.value}
                      onChange={field.handleChange}
                    />
                  )}
                </form.Field>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Technology</CardTitle>
          <CardDescription>Shown on the card and on the stack page.</CardDescription>
        </CardHeader>
        <CardContent>
          <form.Field name="tech">
            {(field) => (
              <StringListField
                id="tech"
                label="Technologies"
                addLabel="Add technology"
                placeholder="PostgreSQL"
                values={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Images</CardTitle>
          <CardDescription>
            Alt text is required in all three languages before the project can be published.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form.Field name="images">
            {(field) => <ProjectImagesField values={field.state.value} onChange={field.handleChange} />}
          </form.Field>
        </CardContent>
      </Card>

      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const missing = missingPublishRequirements(toWriteInput(values))

          return (
            <Card>
              <CardHeader>
                <CardTitle>Visibility</CardTitle>
                <CardDescription>
                  A published project is readable by every visitor, in all three languages.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <form.Field name="isPublished">
                  {(field) => (
                    <div className="flex items-center gap-3">
                      <Switch
                        id="isPublished"
                        checked={field.state.value}
                        disabled={missing.length > 0 && !field.state.value}
                        onCheckedChange={(checked) => field.handleChange(checked)}
                      />
                      <Label htmlFor="isPublished">Published</Label>
                    </div>
                  )}
                </form.Field>

                {missing.length > 0 ? (
                  <div className="border-border bg-muted/40 rounded-lg border p-4">
                    <p className="text-sm font-medium">Before this can be published</p>
                    <ul className="text-muted-foreground mt-2 list-disc space-y-1 ps-5 text-sm">
                      {missing.map((entry) => (
                        <li key={entry}>{entry}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )
        }}
      </form.Subscribe>

      {errorMessage ? (
        <div role="alert" className="border-destructive/40 bg-destructive/5 rounded-lg border p-4">
          <p className="text-destructive text-sm font-medium">{errorMessage}</p>
          {fieldIssues.length > 0 ? (
            <ul className="text-destructive/90 mt-2 list-disc space-y-1 ps-5 text-sm">
              {fieldIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? 'Saving…' : isNew ? 'Create project' : 'Save changes'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
