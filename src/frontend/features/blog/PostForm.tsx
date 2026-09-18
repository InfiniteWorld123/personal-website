import { useForm } from '@tanstack/react-form'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { ApiRequestError, toFieldIssues } from '#/frontend/api/response'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '#/frontend/components/admin/Panel'
import { Badge } from '#/frontend/components/ui/badge'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Label } from '#/frontend/components/ui/label'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
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
import { usePrefetch } from '#/frontend/lib/prefetch'
import type { AdminPostDetail } from '#/shared/types/post.types'
import {
  POST_LANGUAGES,
  type PostLanguage,
  missingPublishRequirements,
} from '#/shared/validation/post.validation'
import { RichTextEditor } from './RichTextEditor'
import { adminTagsQuery, postProjectsQuery } from './post-queries'
import {
  slugify,
  toCoverInput,
  toWriteInput,
  type PostBodies,
  type PostFormValues,
} from './post-form-values'

const LANGUAGE_LABELS: Record<PostLanguage, string> = {
  de: 'German',
  en: 'English',
  ar: 'Arabic',
}

/** Radix cannot hold an empty string as a value, so "no project" gets a name. */
const NO_PROJECT = 'none'

/**
 * One block of the form.
 *
 * The editor is a stack of panels on the canvas rather than a stack of cards,
 * so the writing surface sits on the same ground as every other admin page.
 * The heading and its line stay exactly as they were written.
 */
function FormSection({
  title,
  description,
  className,
  children,
}: {
  title: string
  description: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <Panel>
      <PanelHeader className="flex-col items-start gap-1.5">
        <PanelTitle>{title}</PanelTitle>
        <p className="text-muted-foreground max-w-prose text-sm">{description}</p>
      </PanelHeader>
      <PanelBody className={className}>{children}</PanelBody>
    </Panel>
  )
}

/**
 * The tag chips, not yet arrived.
 *
 * Without this the picker showed "No tags yet. Posts can be published without
 * one." for the whole of the request — telling you there are none while the
 * answer was still in flight. Pending and empty are different facts, and this
 * is the one that says *counting*.
 */
function TagChipsSkeleton() {
  return (
    <SkeletonScreen className="flex flex-wrap gap-2" label="Loading the tags">
      <Skeleton className="h-5 w-16 rounded-full" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-5 w-14 rounded-full" />
      <Skeleton className="h-5 w-20 rounded-full" />
    </SkeletonScreen>
  )
}

export function PostForm({
  initialValues,
  initialBodies,
  isNew,
  isSaving,
  onSubmit,
  onCancel,
}: {
  initialValues: PostFormValues
  initialBodies: PostBodies
  isNew: boolean
  isSaving: boolean
  onSubmit: (values: PostFormValues, bodies: PostBodies) => Promise<AdminPostDetail>
  onCancel: () => void
}) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fieldIssues, setFieldIssues] = useState<string[]>([])
  // The articles live beside the form rather than inside it; see `PostBodies`.
  const [bodies, setBodies] = useState<PostBodies>(initialBodies)
  const prefetch = usePrefetch()
  const tags = useQuery(adminTagsQuery())
  const projects = useQuery(postProjectsQuery())

  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      setErrorMessage(null)
      setFieldIssues([])

      try {
        await onSubmit(value, bodies)
      } catch (error) {
        if (error instanceof ApiRequestError) {
          setErrorMessage(error.message)
          setFieldIssues(toFieldIssues(error))

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
      <FormSection
        title="Post"
        description="Facts that are the same in every language."
        className="grid gap-4 sm:grid-cols-2"
      >
        <form.Field name="slug">
          {(field) => (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="slug">URL slug</Label>
                <form.Subscribe selector={(state) => state.values.translations.en.title}>
                  {(englishTitle) =>
                    field.state.value === '' && englishTitle.trim() !== '' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => field.handleChange(slugify(englishTitle))}
                      >
                        Use the English title
                      </Button>
                    ) : null
                  }
                </form.Subscribe>
              </div>
              <Input
                id="slug"
                dir="ltr"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="what-seo-actually-costs"
              />
              <p className="text-muted-foreground text-xs">
                The address becomes /de/blog/{field.state.value || 'slug'}. Changing it breaks existing
                links.
              </p>
            </div>
          )}
        </form.Field>

        <form.Field name="publishedOn">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="publishedOn">Publication date</Label>
              <Input
                id="publishedOn"
                type="date"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                Left empty, publishing stamps today. Editing a published post never moves it.
              </p>
            </div>
          )}
        </form.Field>

        <form.Field name="projectId">
          {(field) => (
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="projectId">About a project</Label>
              {/*
                The same fault the tag picker had, and the worse half of it: a
                select whose options have not arrived holds a value that
                matches no item, so a post that *is* about a case study reads
                as one that is not — until the list lands and the answer
                silently changes under you. Pending is drawn as pending.
              */}
              {projects.isPending ? (
                <SkeletonScreen label="Loading the projects">
                  <Skeleton className="h-8 w-56 max-w-full rounded-lg" />
                </SkeletonScreen>
              ) : (
                <Select
                  value={field.state.value === '' ? NO_PROJECT : field.state.value}
                  onValueChange={(value) => field.handleChange(value === NO_PROJECT ? '' : value)}
                >
                  <SelectTrigger id="projectId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PROJECT}>Not about a project</SelectItem>
                    {(projects.data ?? []).map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-muted-foreground text-xs">
                An article tied to a case study links back to it, and the case study lists it.
              </p>
            </div>
          )}
        </form.Field>
      </FormSection>

      <FormSection
        title="Article"
        description="One tab per language. A tab with no title is treated as not written yet."
      >
        <Tabs defaultValue="de">
          <TabsList>
            <form.Subscribe selector={(state) => state.values.translations}>
              {(translations) =>
                POST_LANGUAGES.map((language) => (
                  <TabsTrigger key={language} value={language}>
                    {LANGUAGE_LABELS[language]}
                    {translations[language].title.trim() === '' ? (
                      <span className="text-muted-foreground ms-2 text-xs">empty</span>
                    ) : null}
                  </TabsTrigger>
                ))
              }
            </form.Subscribe>
          </TabsList>

          {POST_LANGUAGES.map((language) => (
            <TabsContent key={language} value={language} className="flex flex-col gap-4 pt-4">
              <form.Field name={`translations.${language}.title`}>
                {(field) => (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`${language}-title`}>Title</Label>
                    <Input
                      id={`${language}-title`}
                      dir={language === 'ar' ? 'rtl' : 'ltr'}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                  </div>
                )}
              </form.Field>

              <form.Field name={`translations.${language}.excerpt`}>
                {(field) => (
                  <div className="flex flex-col gap-2">
                    <Label htmlFor={`${language}-excerpt`}>Summary</Label>
                    <Textarea
                      id={`${language}-excerpt`}
                      rows={3}
                      dir={language === 'ar' ? 'rtl' : 'ltr'}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                    <p className="text-muted-foreground text-xs">
                      Plain text. It is the card summary, the search-result description, and the feed
                      entry, so it is the sentence that has to earn the click.
                    </p>
                  </div>
                )}
              </form.Field>

              <form.Subscribe selector={(state) => state.values.coverSrc}>
                {(coverSrc) =>
                  coverSrc.trim() === '' ? null : (
                    <form.Field name={`translations.${language}.coverAlt`}>
                      {(field) => (
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`${language}-coverAlt`}>Cover alt text</Label>
                          <Input
                            id={`${language}-coverAlt`}
                            dir={language === 'ar' ? 'rtl' : 'ltr'}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) => field.handleChange(event.target.value)}
                          />
                        </div>
                      )}
                    </form.Field>
                  )
                }
              </form.Subscribe>

              <div className="flex flex-col gap-2">
                <Label>Article</Label>
                <RichTextEditor
                  value={bodies[language]}
                  language={language}
                  onChange={(doc) => setBodies((current) => ({ ...current, [language]: doc }))}
                />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </FormSection>

      <FormSection
        title="Cover image"
        description="Optional. Shown on the card, at the top of the article, and on the social card. With a cover, alt text is required in all three languages."
        className="grid gap-4 sm:grid-cols-4"
      >
        <form.Field name="coverSrc">
          {(field) => (
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="coverSrc">Image path</Label>
              <Input
                id="coverSrc"
                dir="ltr"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="/images/posts/example.webp"
              />
            </div>
          )}
        </form.Field>

        <form.Field name="coverWidth">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="coverWidth">Width</Label>
              <Input
                id="coverWidth"
                type="number"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(Number(event.target.value))}
              />
            </div>
          )}
        </form.Field>

        <form.Field name="coverHeight">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="coverHeight">Height</Label>
              <Input
                id="coverHeight"
                type="number"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(Number(event.target.value))}
              />
            </div>
          )}
        </form.Field>
      </FormSection>

      <FormSection
        title="Tags"
        description="What the archive filters by. Tags are written once, in all three languages."
        className="flex flex-col gap-4"
      >
        <form.Field name="tagIds">
          {(field) =>
            tags.isPending ? (
              <TagChipsSkeleton />
            ) : (tags.data ?? []).length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No tags yet. Posts can be published without one.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {(tags.data ?? []).map((tag) => {
                  const isSelected = field.state.value.includes(tag.id)

                  return (
                    <button
                      key={tag.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() =>
                        field.handleChange(
                          isSelected
                            ? field.state.value.filter((id) => id !== tag.id)
                            : [...field.state.value, tag.id],
                        )
                      }
                    >
                      <Badge variant={isSelected ? 'default' : 'outline'} className="cursor-pointer">
                        {tag.names.en || tag.slug}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )
          }
        </form.Field>

        <Button asChild variant="outline" size="sm" className="w-fit rounded-full">
          <Link to="/admin/blog/tags" {...prefetch(adminTagsQuery())}>
            Manage tags
          </Link>
        </Button>
      </FormSection>

      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const missing = missingPublishRequirements({
            cover: toCoverInput(values),
            translations: toWriteInput(values, bodies).translations,
          })

          return (
            <FormSection
              title="Visibility"
              description="A published post is readable by every visitor, in all three languages."
              className="flex flex-col gap-4"
            >
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
                <div className="bg-muted/40 rounded-xl p-4">
                  <p className="text-sm font-medium">Before this can be published</p>
                  <ul className="text-muted-foreground mt-2 list-disc space-y-1 ps-5 text-sm">
                    {missing.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </FormSection>
          )
        }}
      </form.Subscribe>

      {errorMessage ? (
        <Panel role="alert" className="border-destructive/40 bg-destructive/5 border p-4 ring-0">
          <p className="text-destructive text-sm font-medium">{errorMessage}</p>
          {fieldIssues.length > 0 ? (
            <ul className="text-destructive/90 mt-2 list-disc space-y-1 ps-5 text-sm">
              {fieldIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ) : null}

      <div className="flex items-center gap-3">
        <Button className="rounded-full" type="submit" disabled={isSaving}>
          {isSaving ? 'Saving…' : isNew ? 'Create post' : 'Save changes'}
        </Button>
        <Button
          className="rounded-full"
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}
