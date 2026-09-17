import Image from '@tiptap/extension-image'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { EditorPromptBar } from '#/frontend/features/editor/EditorPromptBar'
import {
  BoldIcon,
  CodeIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  Redo2Icon,
  SquareCodeIcon,
  StrikethroughIcon,
  UnderlineIcon,
  Undo2Icon,
  UnlinkIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { cn } from '#/frontend/lib/utils'
import {
  isSafeHref,
  isSafeImageSrc,
  type RichTextDoc,
} from '#/shared/validation/rich-text'

/**
 * The article editor. It writes the same document the renderer reads, so the
 * node types configured here are exactly the ones `PostBody` knows how to
 * draw; adding one to this list without adding it there makes it disappear
 * from the published page.
 */

type ToolbarButtonProps = {
  label: string
  icon: ReactNode
  isActive?: boolean
  isDisabled?: boolean
  onClick: () => void
}

function ToolbarButton({ label, icon, isActive, isDisabled, onClick }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={isActive ?? false}
      disabled={isDisabled}
      // `onMouseDown` rather than `onClick`: the default would move focus out
      // of the document first, and a command with no selection does nothing.
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      className={cn(
        'text-muted-foreground hover:bg-muted hover:text-foreground inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded-md px-2 text-xs font-semibold transition-colors disabled:opacity-40',
        isActive && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
      )}
    >
      {icon}
    </button>
  )
}

const HEADING_LEVELS = [2, 3, 4] as const

/** A small bar that takes one or two values and hands them back on Apply. */
function Toolbar({ editor }: { editor: Editor }) {
  const [prompt, setPrompt] = useState<'link' | 'image' | null>(null)
  const [issue, setIssue] = useState<string | null>(null)

  const closePrompt = () => {
    setPrompt(null)
    setIssue(null)
  }

  return (
    <div className="border-border border-b">
      <div className="flex flex-wrap items-center gap-0.5 p-2">
        {HEADING_LEVELS.map((level) => (
          <ToolbarButton
            key={level}
            label={`Heading ${level}`}
            icon={<span>H{level}</span>}
            isActive={editor.isActive('heading', { level })}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          />
        ))}

        <span className="bg-border mx-1 h-5 w-px" />

        <ToolbarButton
          label="Bold"
          icon={<BoldIcon className="size-4" />}
          isActive={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          label="Italic"
          icon={<ItalicIcon className="size-4" />}
          isActive={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          label="Underline"
          icon={<UnderlineIcon className="size-4" />}
          isActive={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          label="Strikethrough"
          icon={<StrikethroughIcon className="size-4" />}
          isActive={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />
        <ToolbarButton
          label="Inline code"
          icon={<CodeIcon className="size-4" />}
          isActive={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
        />

        <span className="bg-border mx-1 h-5 w-px" />

        <ToolbarButton
          label="Bullet list"
          icon={<ListIcon className="size-4" />}
          isActive={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          label="Numbered list"
          icon={<ListOrderedIcon className="size-4" />}
          isActive={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          label="Quote"
          icon={<QuoteIcon className="size-4" />}
          isActive={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          label="Code block"
          icon={<SquareCodeIcon className="size-4" />}
          isActive={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        />
        <ToolbarButton
          label="Divider"
          icon={<MinusIcon className="size-4" />}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
        />

        <span className="bg-border mx-1 h-5 w-px" />

        <ToolbarButton
          label="Link"
          icon={<LinkIcon className="size-4" />}
          isActive={editor.isActive('link')}
          onClick={() => {
            setIssue(null)
            setPrompt('link')
          }}
        />
        <ToolbarButton
          label="Remove link"
          icon={<UnlinkIcon className="size-4" />}
          isDisabled={!editor.isActive('link')}
          onClick={() => editor.chain().focus().unsetLink().run()}
        />
        <ToolbarButton
          label="Image"
          icon={<ImageIcon className="size-4" />}
          onClick={() => {
            setIssue(null)
            setPrompt('image')
          }}
        />

        <span className="ms-auto flex items-center gap-0.5">
          <ToolbarButton
            label="Undo"
            icon={<Undo2Icon className="size-4" />}
            isDisabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          />
          <ToolbarButton
            label="Redo"
            icon={<Redo2Icon className="size-4" />}
            isDisabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          />
        </span>
      </div>

      {prompt === 'link' ? (
        <EditorPromptBar
          fields={[
            {
              name: 'href',
              label: 'Link address',
              placeholder: 'https://example.com or /en/work/tech-store',
              value: (editor.getAttributes('link').href as string | undefined) ?? '',
            },
          ]}
          submitLabel="Apply link"
          onCancel={closePrompt}
          onSubmit={({ href }) => {
            const value = (href ?? '').trim()

            // The same rule the server enforces, said early: `javascript:` and
            // friends parse as valid URLs, so the protocol is what is checked.
            if (!isSafeHref(value)) {
              setIssue('A link must be http(s), mailto, or a path on this site.')

              return
            }

            // `setLink` marks the selected text, and `extendMarkRange` only
            // widens a selection that is already inside a link. With the caret
            // sitting in plain text there is nothing to mark, so the address
            // was swallowed and the button looked dead. Write it instead.
            if (editor.state.selection.empty && !editor.isActive('link')) {
              editor
                .chain()
                .focus()
                .insertContent({ type: 'text', text: value, marks: [{ type: 'link', attrs: { href: value } }] })
                .run()
            } else {
              editor.chain().focus().extendMarkRange('link').setLink({ href: value }).run()
            }

            closePrompt()
          }}
        />
      ) : null}

      {prompt === 'image' ? (
        <EditorPromptBar
          fields={[
            { name: 'src', label: 'Image path', placeholder: '/images/posts/example.webp', value: '' },
            { name: 'alt', label: 'Alt text', placeholder: 'What the image shows', value: '' },
          ]}
          submitLabel="Insert image"
          onCancel={closePrompt}
          onSubmit={({ src, alt }) => {
            const value = (src ?? '').trim()

            if (!isSafeImageSrc(value)) {
              setIssue('An image must be an https address or a path on this site.')

              return
            }

            editor.chain().focus().setImage({ src: value, alt: (alt ?? '').trim() }).run()
            closePrompt()
          }}
        />
      ) : null}

      {issue ? (
        <p role="alert" className="text-destructive border-border border-b px-3 pb-2 text-xs">
          {issue}
        </p>
      ) : null}
    </div>
  )
}

export function RichTextEditor({
  value,
  language,
  onChange,
  label,
}: {
  value: RichTextDoc
  /** Sets the writing direction, so the Arabic tab reads right to left. */
  language: 'de' | 'en' | 'ar'
  onChange: (doc: RichTextDoc) => void
  /**
   * What a screen reader calls this box. Without it the editor announces
   * itself as an unnamed text field — tolerable beside a labelled tab in the
   * blog, useless in a reply composer where it is the only one on screen.
   */
  label?: string
}) {
  // One instance per language tab. Radix unmounts the tab that is not open,
  // so only the visible language holds an editor, and switching back rebuilds
  // it from the form's own value rather than from whatever was typed last.
  const editor = useEditor({
      // The page is server-rendered; rendering the editor during SSR throws.
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3, 4] },
          link: {
            openOnClick: false,
            autolink: true,
            // Belt and braces: the schema rejects anything else anyway.
            protocols: ['http', 'https', 'mailto'],
          },
        }),
        Image.configure({ inline: false, allowBase64: false }),
      ],
      content: value,
      onUpdate: ({ editor: instance }) => onChange(instance.getJSON() as RichTextDoc),
  })

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      {editor ? <Toolbar editor={editor} /> : null}
      <EditorContent
        editor={editor}
        dir={language === 'ar' ? 'rtl' : 'ltr'}
        className="post-editor"
        aria-label={label}
      />
    </div>
  )
}
