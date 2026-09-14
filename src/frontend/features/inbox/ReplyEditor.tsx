import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
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
import { useEffect, type ReactNode } from 'react'
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

  return (
    <div className="border-border flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
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

          const href = window.prompt('Link')?.trim()
          // The schema drops an unsafe href anyway; refusing it here means the
          // owner sees nothing happen rather than a link that vanishes later.
          if (href && isSafeHref(href)) editor.chain().focus().setLink({ href }).run()
        }}
      />
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
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON() as RichTextDoc),
  })

  // A draft belongs to the message it was started in. When the parent clears
  // the value — after sending, or on opening another message — the editor has
  // to follow, or the next reply starts with the last one still in it.
  useEffect(() => {
    if (!editor) return

    const isEmpty = value.content.length === 0

    if (isEmpty && !editor.isEmpty) editor.commands.clearContent()
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
