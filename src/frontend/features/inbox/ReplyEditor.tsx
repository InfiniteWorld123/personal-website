import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { EditorPromptBar } from '#/frontend/features/editor/EditorPromptBar'
import {
  BoldIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  StrikethroughIcon,
  UnlinkIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '#/frontend/lib/utils'
import { isSafeHref, type RichTextDoc } from '#/shared/validation/rich-text'

/**
 * The reply editor.
 *
 * The blog's editor writes articles; this one writes letters, so the toolbar
 * is deliberately shorter: no headings, no images, no code blocks. What is
 * here is what survives every mail client — weight, emphasis, lists, a quote,
 * and a link.
 *
 * It writes the same document shape the article editor does, which is why the
 * server can turn it into mail HTML without a sanitiser (D24).
 */

function ToolButton({
  label,
  icon,
  active,
  onClick,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      // `onMouseDown`, not `onClick`: the default would take focus out of the
      // document first, and a command with no selection does nothing.
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-foreground grid size-7 place-items-center rounded-md transition-colors',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {icon}
    </button>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const linkActive = editor.isActive('link')
  const [asking, setAsking] = useState(false)
  const [issue, setIssue] = useState<string | null>(null)

  const closeAsking = () => {
    setAsking(false)
    setIssue(null)
  }

  return (
    <div className="border-border border-b">
    <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1">
      <ToolButton label="Bold" icon={<BoldIcon className="size-3.5" />}
        active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
      <ToolButton label="Italic" icon={<ItalicIcon className="size-3.5" />}
        active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
      <ToolButton label="Strikethrough" icon={<StrikethroughIcon className="size-3.5" />}
        active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} />
      <span className="bg-border mx-1 h-4 w-px" />
      <ToolButton label="Bullet list" icon={<ListIcon className="size-3.5" />}
        active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
      <ToolButton label="Numbered list" icon={<ListOrderedIcon className="size-3.5" />}
        active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
      <ToolButton label="Quote" icon={<QuoteIcon className="size-3.5" />}
        active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
      <span className="bg-border mx-1 h-4 w-px" />
      <ToolButton
        label={linkActive ? 'Remove link' : 'Add link'}
        icon={linkActive ? <UnlinkIcon className="size-3.5" /> : <LinkIcon className="size-3.5" />}
        active={linkActive}
        onClick={() => {
          if (linkActive) {
            editor.chain().focus().unsetLink().run()

            return
          }

          setAsking(true)
        }}
      />
    </div>

      {asking ? (
        <EditorPromptBar
          fields={[
            {
              name: 'href',
              label: 'Link address',
              placeholder: 'https://example.com or /de/booking',
              value: '',
            },
          ]}
          submitLabel="Apply link"
          onCancel={closeAsking}
          onSubmit={({ href }) => {
            const value = (href ?? '').trim()

            // The same rule the server enforces, said early: `javascript:` and
            // friends parse as valid URLs, so the protocol is what is checked.
            if (!isSafeHref(value)) {
              setIssue('A link must be http(s), mailto, or a path on this site.')

              return
            }

            // `setLink` marks the selected text. With nothing selected there is
            // nothing to mark, and the button appeared to do nothing at all —
            // so write the address itself and link that.
            if (editor.state.selection.empty) {
              editor
                .chain()
                .focus()
                .insertContent({ type: 'text', text: value, marks: [{ type: 'link', attrs: { href: value } }] })
                .run()
            } else {
              editor.chain().focus().setLink({ href: value }).run()
            }

            closeAsking()
          }}
        />
      ) : null}

      {issue ? <p className="text-destructive px-2 pb-2 text-xs">{issue}</p> : null}
    </div>
  )
}

export function ReplyEditor({
  value,
  language,
  placeholder,
  minHeight = '9rem',
  onChange,
}: {
  value: RichTextDoc
  /** Sets the writing direction: an Arabic reply is written right to left. */
  language: 'de' | 'en' | 'ar'
  placeholder: string
  minHeight?: string
  onChange: (doc: RichTextDoc) => void
}) {
  const editor = useEditor({
    // The admin is server-rendered; rendering the editor during SSR throws.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] },
      }),
    ],
    content: value,
    onUpdate: ({ editor: instance }) => {
      const doc = instance.getJSON() as RichTextDoc

      emitted.current = doc
      onChange(doc)
    },
  })

  /**
   * The last document this editor produced itself. Anything else arriving in
   * `value` came from the parent — a snippet button, a cleared draft — and has
   * to be written into the editor, which otherwise never looks at the prop
   * again after mount. Skipping our own echo is what keeps typing from
   * resetting the document and throwing the cursor to the start.
   */
  const emitted = useRef<RichTextDoc | null>(null)

  // A draft belongs to the message it was started in. When the parent clears
  // the value — after sending, or on opening another message — the editor has
  // to follow, or the next reply starts with the last one still in it.
  useEffect(() => {
    if (!editor || value === emitted.current) return

    if (value.content.length === 0) {
      if (!editor.isEmpty) editor.commands.clearContent()

      return
    }

    emitted.current = value
    editor.commands.setContent(value, { emitUpdate: false })
    editor.commands.focus('end')
  }, [editor, value])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editor ? <Toolbar editor={editor} /> : null}
      <EditorContent
        editor={editor}
        dir={language === 'ar' ? 'rtl' : 'ltr'}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className={cn(
          'min-h-0 flex-1 overflow-y-auto px-3 py-2 text-sm leading-7',
          '[&_.ProseMirror]:min-h-full [&_.ProseMirror]:outline-none',
          '[&_.ProseMirror_p]:my-0 [&_.ProseMirror_p+p]:mt-3',
          '[&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ps-5',
          '[&_.ProseMirror_ol]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ps-5',
          '[&_.ProseMirror_blockquote]:border-border [&_.ProseMirror_blockquote]:text-muted-foreground',
          '[&_.ProseMirror_blockquote]:my-2 [&_.ProseMirror_blockquote]:border-s-2 [&_.ProseMirror_blockquote]:ps-3',
          '[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline',
        )}
      />
    </div>
  )
}
