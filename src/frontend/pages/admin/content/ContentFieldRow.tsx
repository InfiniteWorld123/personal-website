import { ArrowDown, ArrowUp, Check, Plus, RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Textarea } from '#/frontend/components/ui/textarea'
import type { EditableField } from '#/frontend/content/editable'
import { cn } from '#/frontend/lib/utils'
import type { ContentValue } from '#/shared/types/content.types'
import { fieldLabel } from './content-format'

/**
 * One editable string, with everything that belongs to it: how long it is
 * against the length the design expects, whether it is waiting to be
 * published, whether the other languages have caught up, and the way back to
 * the wording the code ships.
 *
 * The row holds its own text while it is being typed and is remounted by its
 * parent when the value changes from somewhere else — a reset, a restore, a
 * language switch. That is what keeps an autosave from overwriting the letters
 * typed while it was in flight.
 */
export function ContentFieldRow({
  field,
  value,
  language,
  isDraft,
  needsReview,
  locked,
  onChange,
  onReset,
  onReviewed,
}: {
  field: EditableField
  value: ContentValue | undefined
  language: string
  isDraft: boolean
  needsReview: boolean
  locked: boolean
  onChange: (value: ContentValue) => void
  onReset: () => void
  onReviewed: () => void
}) {
  const isArabic = language === 'ar'
  const [text, setText] = useState(() =>
    typeof value === 'string' || typeof value === 'number' ? String(value) : '',
  )
  const [list, setList] = useState<string[]>(() => (Array.isArray(value) ? value : []))

  const length = field.kind === 'list' ? Math.max(...list.map((e) => e.length), 0) : text.length
  const over = field.max > 0 && length > field.max

  const commitText = (next: string) => {
    // The lock is a real gate, not only a greyed-out box: this is the legal
    // text the owner asked to be able to edit against advice, and a stray
    // change reaching the draft would be the exact failure that argued against it.
    if (locked) return

    setText(next)
    if (field.kind === 'number') {
      const parsed = Number(next)
      if (Number.isFinite(parsed) && next.trim() !== '') onChange(Math.round(parsed))
      return
    }
    if (next.trim() !== '') onChange(next)
  }

  const commitList = (next: string[]) => {
    if (locked) return

    setList(next)
    if (next.every((entry) => entry.trim() !== '')) onChange(next)
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= list.length) return

    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    commitList(next)
  }

  return (
    <div className={cn('field-row', isDraft && 'is-draft')} id={`field-${field.key}`}>
      <div className="field-row-head">
        <label className="field-row-label" htmlFor={`input-${field.key}`}>
          {fieldLabel(field.key)}
        </label>
        {isDraft ? <span className="pill pill-draft">draft</span> : null}
        {needsReview ? <span className="pill pill-review">needs review</span> : null}
        {field.shared ? <span className="pill pill-shared">all languages</span> : null}

        <div className="field-row-actions">
          {needsReview ? (
            <Button size="sm" variant="ghost" onClick={onReviewed}>
              <Check className="size-3.5" />
              Looks right
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" disabled={locked} onClick={onReset}>
            <RotateCcw className="size-3.5" />
            Original
          </Button>
        </div>
      </div>

      {field.kind === 'list' ? (
        <div className="list-editor">
          {list.map((entry, index) => (
            // The index is the identity here: entries are reordered and
            // rewritten, and keying by text would remount the input being typed in.
            <div className="list-row" key={index}>
              <Input
                value={entry}
                disabled={locked}
                dir={isArabic ? 'rtl' : undefined}
                onChange={(event) =>
                  commitList(list.map((old, at) => (at === index ? event.target.value : old)))
                }
              />
              <Button
                size="icon"
                variant="ghost"
                disabled={locked || index === 0}
                title="Move up"
                onClick={() => move(index, index - 1)}
              >
                <ArrowUp className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={locked || index === list.length - 1}
                title="Move down"
                onClick={() => move(index, index + 1)}
              >
                <ArrowDown className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled={locked || list.length < 2}
                title="Remove"
                onClick={() => commitList(list.filter((_, at) => at !== index))}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={locked}
            onClick={() => setList([...list, ''])}
          >
            <Plus className="size-3.5" />
            Add entry
          </Button>
        </div>
      ) : field.kind === 'area' ? (
        <Textarea
          id={`input-${field.key}`}
          rows={Math.min(8, Math.max(2, Math.ceil(text.length / 90)))}
          value={text}
          disabled={locked}
          dir={isArabic ? 'rtl' : undefined}
          onChange={(event) => commitText(event.target.value)}
        />
      ) : (
        <Input
          id={`input-${field.key}`}
          type={field.kind === 'number' ? 'number' : 'text'}
          value={text}
          disabled={locked}
          dir={isArabic && field.kind !== 'number' ? 'rtl' : undefined}
          onChange={(event) => commitText(event.target.value)}
        />
      )}

      {field.max > 0 ? (
        <span className={cn('field-row-count', over && 'is-over')}>
          {length} / {field.max}
          {over ? ' — longer than the design expects' : ''}
        </span>
      ) : null}
    </div>
  )
}
