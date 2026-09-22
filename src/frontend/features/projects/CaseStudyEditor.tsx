import { useState } from 'react'
import Image from '@tiptap/extension-image'
import { TableKit } from '@tiptap/extension-table'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
} from 'lucide-react'
import type { MediaAsset } from '#/backend2/contracts/media.contract'
import { isSafeHref, type RichTextDoc } from '#/backend2/contracts/rich-text.contract'
import { normalizeDoc } from './case-study-document'
import { MediaPicker } from '#/frontend/features/media/MediaPicker'
import { cn } from '#/frontend/lib/utils'

/**
 * The case-study editor.
 *
 * A second editor rather than the blog's, and not by accident: V2 changed the
 * one thing that matters most here. An inline image carries a **`mediaId`**,
 * never a URL — the server resolves it when it builds a response, and that is
 * what makes the image accounting provable, because every file a project uses
 * is discoverable from the database alone. The legacy editor writes `src`, and
 * legacy articles must keep parsing with the legacy schema.
 *
 * It also has to look like the dashboard rather than the public site, and it
 * gains tables, which the blog does not have.
 */

const ownerImageUrl = (mediaId: string): string =>
  `/api/v2/owner/media/files/${mediaId}/content`

/**
 * The image node, by library id.
 *
 * `src` is declared but deliberately derived: it is rendered into the DOM so
 * the picture is visible while editing, and dropped on the way back out, so
 * the stored document never contains an address that could go stale or point
 * somewhere a visitor is not allowed to look.
 */
const MediaImage = Image.extend({
  addAttributes() {
    return {
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-media-id'),
        renderHTML: (attributes) =>
          attributes.mediaId ? { 'data-media-id': attributes.mediaId as string } : {},
      },
      alt: { default: '' },
      width: { default: null },
      height: { default: null },
      src: {
        default: null,
        renderHTML: (attributes) =>
          attributes.mediaId ? { src: ownerImageUrl(attributes.mediaId as string) } : {},
      },
    }
  },
})

/* -------------------------------------------------------------------- toolbar */

function ToolbarButton({
  label,
  icon,
  active,
  disabled,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active ?? false}
      disabled={disabled}
      // `onMouseDown`, not `onClick`: the default would move focus out of the
      // document first, and a command with no selection does nothing.
      onMouseDown={(event) => {
        event.preventDefault()
        onClick()
      }}
      className={cn(
        'inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-[12px] font-semibold text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)] disabled:opacity-40',
        active && 'bg-[var(--dash-blue-tint)] text-[var(--dash-blue-ink)]',
      )}
    >
      {icon}
    </button>
  )
}

function Toolbar({ editor, onPickImage }: { editor: Editor; onPickImage: () => void }) {
  const setLink = () => {
    const current = (editor.getAttributes('link').href as string | undefined) ?? ''
    const entered = window.prompt('Address for this link', current)

    if (entered === null) return

    if (entered.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()

      return
    }

    if (!isSafeHref(entered)) {
      window.alert('A link must start with http://, https://, mailto: or / for a page on this site.')

      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: entered.trim() }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--dash-line)] p-1.5">
      <ToolbarButton
        label="Heading"
        icon={<Heading2 className="size-4" />}
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="Sub-heading"
        icon={<Heading3 className="size-4" />}
        active={editor.isActive('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      />

      <span className="mx-1 h-5 w-px bg-[var(--dash-line)]" aria-hidden="true" />

      <ToolbarButton
        label="Bold"
        icon={<Bold className="size-4" />}
        active={editor.isActive('bold')}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="Italic"
        icon={<Italic className="size-4" />}
        active={editor.isActive('italic')}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="Underline"
        icon={<UnderlineIcon className="size-4" />}
        active={editor.isActive('underline')}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />
      <ToolbarButton
        label="Strikethrough"
        icon={<Strikethrough className="size-4" />}
        active={editor.isActive('strike')}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        label="Inline code"
        icon={<Code className="size-4" />}
        active={editor.isActive('code')}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />

      <span className="mx-1 h-5 w-px bg-[var(--dash-line)]" aria-hidden="true" />

      <ToolbarButton label="Link" icon={<LinkIcon className="size-4" />} active={editor.isActive('link')} onClick={setLink} />
      <ToolbarButton
        label="Remove link"
        icon={<Unlink className="size-4" />}
        disabled={!editor.isActive('link')}
        onClick={() => editor.chain().focus().unsetLink().run()}
      />

      <span className="mx-1 h-5 w-px bg-[var(--dash-line)]" aria-hidden="true" />

      <ToolbarButton
        label="Bulleted list"
        icon={<List className="size-4" />}
        active={editor.isActive('bulletList')}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="Numbered list"
        icon={<ListOrdered className="size-4" />}
        active={editor.isActive('orderedList')}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="Quote"
        icon={<Quote className="size-4" />}
        active={editor.isActive('blockquote')}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        label="Code block"
        icon={<SquareCode className="size-4" />}
        active={editor.isActive('codeBlock')}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <ToolbarButton
        label="Divider"
        icon={<Minus className="size-4" />}
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />

      <span className="mx-1 h-5 w-px bg-[var(--dash-line)]" aria-hidden="true" />

      <ToolbarButton label="Image from Media" icon={<ImagePlus className="size-4" />} onClick={onPickImage} />
      <ToolbarButton
        label="Table"
        icon={<TableIcon className="size-4" />}
        active={editor.isActive('table')}
        onClick={() =>
          editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      />

      <span className="ms-auto flex gap-0.5">
        <ToolbarButton
          label="Undo"
          icon={<Undo2 className="size-4" />}
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          label="Redo"
          icon={<Redo2 className="size-4" />}
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------- editor */

export function CaseStudyEditor({
  value,
  language,
  onChange,
  label,
}: {
  value: RichTextDoc | null
  /** Sets the writing direction, so the Arabic tab reads right to left. */
  language: 'de' | 'en' | 'ar'
  onChange: (doc: RichTextDoc | null) => void
  label: string
}) {
  const [picking, setPicking] = useState(false)

  const editor = useEditor(
    {
      // The page is server-rendered; rendering the editor during SSR throws.
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          heading: { levels: [2, 3, 4] },
          link: {
            openOnClick: false,
            autolink: true,
            // Belt and braces: the contract rejects anything else anyway.
            protocols: ['http', 'https', 'mailto'],
          },
        }),
        MediaImage.configure({ inline: false, allowBase64: false }),
        TableKit.configure({ table: { resizable: false } }),
      ],
      content: value ?? { type: 'doc', content: [] },
      onUpdate: ({ editor: instance }) => {
        const doc = normalizeDoc(instance.getJSON())

        // An empty document is `null`, not an empty tree: "this language has
        // no case study" is a real state, and publication treats it as one.
        onChange(doc.content.length === 0 ? null : doc)
      },
    },
    // Rebuilt per language, so switching tabs loads that language's document
    // rather than keeping the previous one in the box.
    [language],
  )

  const insert = (asset: MediaAsset) => {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: {
          mediaId: asset.id,
          alt: '',
          width: asset.width ?? null,
          height: asset.height ?? null,
        },
      })
      .run()

    setPicking(false)
  }

  return (
    <div className="dash-panel overflow-hidden">
      {editor ? <Toolbar editor={editor} onPickImage={() => setPicking(true)} /> : null}

      <EditorContent
        editor={editor}
        dir={language === 'ar' ? 'rtl' : 'ltr'}
        aria-label={label}
        className={cn(
          'min-h-48 px-3.5 py-3 text-[13px] leading-relaxed',
          '[&_.ProseMirror]:outline-none',
          '[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-[16px] [&_h2]:font-semibold',
          '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-[14px] [&_h3]:font-semibold',
          '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-[13px] [&_h4]:font-semibold',
          '[&_p]:my-1.5',
          '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:ps-5',
          '[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:ps-5',
          '[&_blockquote]:my-2 [&_blockquote]:border-s-2 [&_blockquote]:border-[var(--dash-brand)] [&_blockquote]:ps-3 [&_blockquote]:text-[var(--dash-quiet)]',
          '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[var(--dash-slab)] [&_pre]:p-3 [&_pre]:text-[12px] [&_pre]:text-[var(--dash-slab-ink)]',
          '[&_code]:rounded [&_code]:bg-[var(--dash-chip)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[12px]',
          '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
          '[&_hr]:my-4 [&_hr]:border-[var(--dash-line)]',
          '[&_a]:text-[var(--dash-brand)] [&_a]:underline',
          '[&_img]:my-2 [&_img]:max-w-full [&_img]:rounded-[9px] [&_img]:border [&_img]:border-[var(--dash-line)]',
          '[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse',
          '[&_td]:border [&_td]:border-[var(--dash-line)] [&_td]:p-1.5',
          '[&_th]:border [&_th]:border-[var(--dash-line)] [&_th]:bg-[var(--dash-chip)] [&_th]:p-1.5 [&_th]:font-semibold',
          // The placeholder of an empty document, so the box is not a blank
          // rectangle with no invitation in it.
          '[&_.ProseMirror.is-editor-empty:first-child::before]:text-[var(--dash-quiet)]',
        )}
      />

      <p className="border-t border-[var(--dash-line)] px-3.5 py-2 text-[11.5px] text-[var(--dash-quiet)]">
        Optional. A good shape is the task, what you built, and what changed — but it is a
        suggestion, not a form. Every image you add here needs its own description in this
        language before the project can be published.
      </p>

      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onChoose={insert}
        kind="image"
        title="Choose an image for the case study"
        description="It is added to your Media library first, then placed in the story."
      />
    </div>
  )
}
