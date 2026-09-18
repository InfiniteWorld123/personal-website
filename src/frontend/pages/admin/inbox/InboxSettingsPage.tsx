import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelNote,
  PanelTitle,
} from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { Textarea } from '#/frontend/components/ui/textarea'
import {
  inboxQuery,
  settingsQuery,
  useSaveSignature,
  useSaveSnippets,
} from '#/frontend/features/inbox/inbox-queries'
import { LANGUAGE_LABEL } from '#/frontend/features/inbox/inbox-format'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { INBOX_LANGUAGES, type InboxLanguage } from '#/shared/validation/inbox.validation'
import type { Snippet } from '#/shared/types/inbox.types'
import { cn } from '#/frontend/lib/utils'

const EMPTY: Record<InboxLanguage, string> = { de: '', en: '', ar: '' }

/**
 * The owner's own wording: a signature per language, and the canned replies.
 *
 * Both are one JSON row in `app_settings`, so adding a snippet is never a
 * migration — which matters because his wording will keep changing.
 *
 * The form is not drawn until the saved wording is in hand. It used to render
 * blank while the request was still out, so a slow answer — or a failed one —
 * put an empty signature under a Save button that would then have written the
 * blank over the real one.
 */
export function InboxSettingsPage() {
  const prefetch = usePrefetch()
  const settings = useQuery(settingsQuery())
  const saveSignature = useSaveSignature()
  const saveSnippets = useSaveSnippets()

  const [signature, setSignature] = useState<Record<InboxLanguage, string>>(EMPTY)
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [tab, setTab] = useState<InboxLanguage>('de')

  useEffect(() => {
    if (!settings.data) return
    setSignature({ ...EMPTY, ...settings.data.signature })
    setSnippets(settings.data.snippets)
  }, [settings.data])

  return (
    <AdminPage width="narrow">
      <PageHeader
        back={
          <Button asChild className="-ms-2 self-start" variant="ghost" size="icon">
            <Link
              to="/admin/inbox"
              aria-label="Back to the inbox"
              {...prefetch(inboxQuery('inbox', ''))}
            >
              <ArrowLeft aria-hidden="true" />
            </Link>
          </Button>
        }
        title="Inbox settings"
        description="Your signature and the replies you send often."
      />

      {settings.isPending ? (
        <SettingsSkeleton />
      ) : settings.isError ? (
        <Panel>
          <PanelNote tone="error">
            <div>
              <p className="font-medium">Your settings could not be loaded.</p>
              <p className="text-muted-foreground mt-1">
                {settings.error instanceof Error ? settings.error.message : 'Something went wrong.'}
              </p>
            </div>
            <Button onClick={() => void settings.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </PanelNote>
        </Panel>
      ) : (
        <>
          <Panel>
            <PanelHeader className="flex-col items-start gap-1.5 pb-3">
              <PanelTitle>Signature</PanelTitle>
              <p className="text-muted-foreground text-xs">
                Added to the bottom of every reply, in the language you are writing in. Leave one
                empty and nothing is added for that language.
              </p>
            </PanelHeader>

            <PanelBody className="flex flex-col gap-3">
              <div className="flex gap-1.5">
                {INBOX_LANGUAGES.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTab(value)}
                    aria-pressed={tab === value}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs motion-safe:transition-colors',
                      tab === value
                        ? 'border-primary bg-primary text-primary-foreground font-medium'
                        : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground',
                    )}
                  >
                    {LANGUAGE_LABEL[value]}
                  </button>
                ))}
              </div>

              <Textarea
                value={signature[tab]}
                dir={tab === 'ar' ? 'rtl' : 'ltr'}
                onChange={(event) =>
                  setSignature((current) => ({
                    ...current,
                    [tab]: event.currentTarget.value,
                  }))
                }
                rows={4}
                placeholder={
                  tab === 'ar' ? 'يمان وردة\nyamanwarda.de' : 'Yaman Warda\nyamanwarda.de'
                }
                aria-label={`Signature in ${LANGUAGE_LABEL[tab]}`}
              />

              <Button
                className="self-start rounded-full"
                size="sm"
                onClick={() => saveSignature.mutate(signature)}
                disabled={saveSignature.isPending}
              >
                {saveSignature.isPending ? 'Saving…' : 'Save signature'}
              </Button>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader className="flex-col items-start gap-1.5 pb-3">
              <PanelTitle>Ready replies</PanelTitle>
              <p className="text-muted-foreground text-xs">
                Sentences you write once and use often. They appear under the reply box for the
                language you are writing in.
              </p>
            </PanelHeader>

            <PanelBody className="flex flex-col gap-3">
              {snippets.map((snippet, index) => (
                <div
                  key={index}
                  className="border-border/60 flex flex-col gap-2 rounded-xl border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={snippet.label}
                      dir="auto"
                      onChange={(event) =>
                        setSnippets((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, label: event.currentTarget.value } : item,
                          ),
                        )
                      }
                      placeholder="Short name, e.g. Thanks"
                      className="h-9 flex-1 text-sm"
                      aria-label="Snippet name"
                    />

                    <select
                      value={snippet.language}
                      onChange={(event) =>
                        setSnippets((current) =>
                          current.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  language: event.currentTarget.value as InboxLanguage,
                                }
                              : item,
                          ),
                        )
                      }
                      className="border-border bg-background focus-visible:ring-ring h-9 rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                      aria-label="Snippet language"
                    >
                      {INBOX_LANGUAGES.map((value) => (
                        <option key={value} value={value}>
                          {LANGUAGE_LABEL[value]}
                        </option>
                      ))}
                    </select>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() =>
                        setSnippets((current) => current.filter((_, i) => i !== index))
                      }
                      aria-label={`Remove ${snippet.label || 'this snippet'}`}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </div>

                  <Textarea
                    value={snippet.body}
                    dir={snippet.language === 'ar' ? 'rtl' : 'ltr'}
                    onChange={(event) =>
                      setSnippets((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, body: event.currentTarget.value } : item,
                        ),
                      )
                    }
                    rows={2}
                    className="text-sm"
                    aria-label="Snippet text"
                  />
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                className="self-start rounded-full"
                onClick={() =>
                  setSnippets((current) => [...current, { label: '', body: '', language: tab }])
                }
              >
                <Plus aria-hidden="true" />
                Add a reply
              </Button>

              <Button
                className="self-start rounded-full"
                size="sm"
                onClick={() =>
                  saveSnippets.mutate({
                    items: snippets.filter(
                      (snippet) => snippet.label.trim() !== '' && snippet.body.trim() !== '',
                    ),
                  })
                }
                disabled={saveSnippets.isPending}
              >
                {saveSnippets.isPending ? 'Saving…' : 'Save replies'}
              </Button>
            </PanelBody>
          </Panel>
        </>
      )}
    </AdminPage>
  )
}

/**
 * The two panels at the heights they will have: the signature box is four
 * rows, a ready reply is a name and two rows, and both end in a button.
 */
function SettingsSkeleton() {
  return (
    <SkeletonScreen className="flex flex-col gap-6" label="Loading your inbox settings">
      <Panel>
        <PanelHeader className="flex-col items-start gap-2 pb-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-full max-w-md" />
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          <div className="flex gap-1.5">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-24 w-full rounded-md" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader className="flex-col items-start gap-2 pb-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-full max-w-md" />
        </PanelHeader>
        <PanelBody className="flex flex-col gap-3">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="border-border/60 flex flex-col gap-2 rounded-xl border p-3" key={index}>
              <div className="flex items-center gap-2">
                <Skeleton className="h-9 flex-1 rounded-md" />
                <Skeleton className="h-9 w-24 rounded-md" />
                <Skeleton className="size-9 rounded-md" />
              </div>
              <Skeleton className="h-14 w-full rounded-md" />
            </div>
          ))}
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </PanelBody>
      </Panel>
    </SkeletonScreen>
  )
}
