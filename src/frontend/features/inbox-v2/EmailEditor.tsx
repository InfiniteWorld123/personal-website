import { useEffect } from 'react'
import { EditorContent, type Editor, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
} from 'lucide-react'
import { type RichTextDoc, isSafeHref } from '#/backend2/contracts/rich-text.contract'
import { RICH_TEXT_CONTENT_CLASS, ToolbarButton } from '#/frontend/features/projects/CaseStudyEditor'
import { normalizeDoc } from '#/frontend/features/projects/case-study-document'
import { cn } from '#/frontend/lib/utils'

/**
 * The email body: the same editor as a case study, cut down to what an email
 * can carry. No image and no table — files are attached from Media instead,
 * and the server refuses both in a body anyway. Headings stay out of the
 * toolbar: an email is a letter, not a page.
 */

/** Plain text as paragraphs, for a signature or a ready reply. */
export const textToParagraphs = (text: string) =>
  text
    .replace(/\r\n/gu, '\n')
    .split(/\n{2,}/u)
    .map((block) => ({
      type: 'paragraph',
      content: block
        .split('\n')
        .flatMap((line, index) => [
          ...(index > 0 ? [{ type: 'hardBreak' }] : []),
          ...(line === '' ? [] : [{ type: 'text', text: line }]),
        ]),
    }))

export function EmailEditor({
  value,
  onChange,
  onReady,
  rtl,
  labelledBy,
  invalid,
  describedBy,
}: {
  value: RichTextDoc
  onChange: (doc: RichTextDoc) => void
  onReady?: (editor: Editor) => void
  rtl: boolean
  labelledBy: string
  invalid?: boolean
  describedBy?: string
}) {
  const editor = useEditor({
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
    editorProps: {
      attributes: {
        id: 'email-body',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelledBy,
        ...(invalid ? { 'aria-invalid': 'true' } : {}),
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      },
    },
    onUpdate: ({ editor: instance }) => onChange(normalizeDoc(instance.getJSON())),
  })

  useEffect(() => {
    if (editor) onReady?.(editor)
  }, [editor, onReady])

  // The invalid state is set after the editor exists, so it follows the form.
  useEffect(() => {
    const element = editor?.view.dom

    if (!element) return

    if (invalid) element.setAttribute('aria-invalid', 'true')
    else element.removeAttribute('aria-invalid')

    if (describedBy) element.setAttribute('aria-describedby', describedBy)
    else element.removeAttribute('aria-describedby')
  }, [editor, invalid, describedBy])

  const setLink = () => {
    if (!editor) return

    const current = (editor.getAttributes('link').href as string | undefined) ?? ''
    const entered = window.prompt('Address for this link', current)

    if (entered === null) return

    if (entered.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()

      return
    }

    if (!isSafeHref(entered) || entered.trim().startsWith('/')) {
      window.alert('A link in an email must start with http://, https:// or mailto:.')

      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: entered.trim() }).run()
  }

  return (
    <div className={cn('overflow-hidden rounded-[10px] border bg-[var(--dash-input)]', invalid ? 'border-[var(--dash-red)]' : 'border-[var(--dash-line)]')}>
      {editor ? (
        <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-[var(--dash-line)] p-1">
          <ToolbarButton label="Bold" icon={<Bold className="size-4" />} active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
          <ToolbarButton label="Italic" icon={<Italic className="size-4" />} active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <ToolbarButton label="Underline" icon={<UnderlineIcon className="size-4" />} active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <ToolbarButton label="Link" icon={<LinkIcon className="size-4" />} active={editor.isActive('link')} onClick={setLink} />
          <ToolbarButton label="Remove link" icon={<Unlink className="size-4" />} disabled={!editor.isActive('link')} onClick={() => editor.chain().focus().unsetLink().run()} />
          <span className="mx-1 h-5 w-px bg-[var(--dash-line)]" aria-hidden="true" />
          <ToolbarButton label="Bulleted list" icon={<List className="size-4" />} active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <ToolbarButton label="Numbered list" icon={<ListOrdered className="size-4" />} active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <ToolbarButton label="Quote" icon={<Quote className="size-4" />} active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} />
          <span className="ms-auto flex">
            <ToolbarButton label="Undo" icon={<Undo2 className="size-4" />} disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} />
            <ToolbarButton label="Redo" icon={<Redo2 className="size-4" />} disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} />
          </span>
        </div>
      ) : null}
      <EditorContent editor={editor} dir={rtl ? 'rtl' : 'auto'} className={cn(RICH_TEXT_CONTENT_CLASS, 'min-h-40')} />
    </div>
  )
}
