import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Textarea } from '#/frontend/components/ui/textarea'
import {
  settingsQuery,
  useSaveSignature,
  useSaveSnippets,
} from '#/frontend/features/inbox/inbox-queries'
import { LANGUAGE_LABEL } from '#/frontend/features/inbox/inbox-format'
import { INBOX_LANGUAGES, type InboxLanguage } from '#/shared/validation/inbox.validation'
import type { Snippet } from '#/shared/types/inbox.types'
import { cn } from '#/frontend/lib/utils'

const EMPTY: Record<InboxLanguage, string> = { de: '', en: '', ar: '' }

/**
 * The owner's own wording: a signature per language, and the canned replies.
 *
 * Both are one JSON row in `app_settings`, so adding a snippet is never a
 * migration — which matters because his wording will keep changing.
 */
export function InboxSettingsPage() {
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
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <header className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/admin/inbox" aria-label="Back to the inbox">
            <ArrowLeft aria-hidden="true" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your signature and the replies you send often.
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Signature</h2>
        <p className="text-muted-foreground text-xs">
          Added to the bottom of every reply, in the language you are writing in. Leave one empty
          and nothing is added for that language.
        </p>

        <div className="flex gap-1.5">
          {INBOX_LANGUAGES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                tab === value
                  ? 'border-primary bg-primary text-primary-foreground font-medium'
                  : 'border-border text-muted-foreground hover:text-foreground',
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
            setSignature((current) => ({ ...current, [tab]: event.currentTarget.value }))
          }
          rows={4}
          placeholder={tab === 'ar' ? 'يمان وردة\nyamanwarda.de' : 'Yaman Warda\nyamanwarda.de'}
          aria-label={`Signature in ${LANGUAGE_LABEL[tab]}`}
        />

        <Button
          className="self-start"
          size="sm"
          onClick={() => saveSignature.mutate(signature)}
          disabled={saveSignature.isPending}
        >
          {saveSignature.isPending ? 'Saving…' : 'Save signature'}
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Ready replies</h2>
        <p className="text-muted-foreground text-xs">
          Sentences you write once and use often. They appear under the reply box for the language
          you are writing in.
        </p>

        {snippets.map((snippet, index) => (
          <div key={index} className="border-border flex flex-col gap-2 rounded-xl border p-3">
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
                        ? { ...item, language: event.currentTarget.value as InboxLanguage }
                        : item,
                    ),
                  )
                }
                className="border-border bg-background h-9 rounded-md border px-2 text-sm"
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
                onClick={() => setSnippets((current) => current.filter((_, i) => i !== index))}
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
          className="self-start"
          onClick={() =>
            setSnippets((current) => [...current, { label: '', body: '', language: tab }])
          }
        >
          <Plus aria-hidden="true" />
          Add a reply
        </Button>

        <Button
          className="self-start"
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
      </section>
    </div>
  )
}
