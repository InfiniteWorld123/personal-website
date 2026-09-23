import { createContext, useContext, useEffect, useId, useState } from 'react'
import { TableKit } from '@tiptap/extension-table'
import {
  EditorContent,
  Node,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
  mergeAttributes,
  useEditor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { AlertTriangle, ImageOff, Play, SquarePlay, Trash2 } from 'lucide-react'
import type { MediaAsset } from '#/backend2/contracts/media.contract'
import {
  BLOG_LIMITS,
  type BlogDoc,
  type Language,
  blogPlainText,
  readingMinutesOf,
  youtubeVideoIdFrom,
} from '#/backend2/contracts/blog.contract'
import {
  MediaImage,
  RICH_TEXT_CONTENT_CLASS,
  Toolbar,
  ownerImageUrl,
} from '#/frontend/features/projects/CaseStudyEditor'
import { MediaPicker } from '#/frontend/features/media/MediaPicker'
import { cn } from '#/frontend/lib/utils'
import { BlogDialog, DialogActions, DialogTitle } from './BlogDialog'
import { countWords, normalizeBlogDoc } from './blog-document'

/**
 * The article editor: the case study's editor, plus what an article needs.
 *
 * One editor rather than a second one (`docs/v2/blog.md`: "reusable across
 * V2 content modules, with module-specific capabilities where needed"). The
 * toolbar, the image node and the look are the Projects editor's. The Blog
 * adds two things the approved Design Lab showed:
 *
 * - a picture carries its alternative text right under it, in the language
 *   being written, because publication asks for one per picture per language;
 * - a YouTube video, stored as its id and nothing else — never a link, never
 *   embed code — and only at the top of the article, never inside a list or a
 *   table, because a player is a block of its own.
 */

const LANGUAGE_LABEL: Record<Language, string> = { de: 'DE', en: 'EN', ar: 'AR' }

/** What every picture and video in the document needs to know about the page around it. */
const ArticleContext = createContext<{ language: Language; attempted: boolean }>({
  language: 'en',
  attempted: false,
})

/* -------------------------------------------------------------- a picture */

function ArticleImageView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const { language, attempted } = useContext(ArticleContext)
  const [broken, setBroken] = useState(false)
  const id = useId()
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
  const mediaId = typeof node.attrs.mediaId === 'string' ? node.attrs.mediaId : ''
  const missing = attempted && alt.trim() === ''

  return (
    <NodeViewWrapper
      className={cn(
        'my-3 overflow-hidden rounded-[10px] border bg-[var(--dash-surface)]',
        selected ? 'border-[var(--dash-brand)]' : 'border-[var(--dash-line)]',
      )}
      data-article-image=""
    >
      <div className="relative" contentEditable={false}>
        {broken ? (
          <div className="flex h-32 items-center justify-center gap-2 bg-[var(--dash-furniture)] text-[12px] text-[var(--dash-quiet)]">
            <ImageOff className="size-4" aria-hidden="true" />
            This picture is not in Media any more
          </div>
        ) : (
          <img
            src={ownerImageUrl(mediaId)}
            alt=""
            draggable={false}
            onError={() => setBroken(true)}
            className="!my-0 block max-h-[420px] w-full !rounded-none !border-0 bg-[var(--dash-furniture)] object-contain"
          />
        )}
        <button
          type="button"
          className="dash-btn dash-btn-quiet absolute end-2 top-2 size-8 p-0 shadow-sm"
          aria-label="Remove this picture"
          title="Remove this picture"
          onClick={() => deleteNode()}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-1.5 border-t border-[var(--dash-line)] bg-[var(--dash-furniture)] px-3 py-2.5" contentEditable={false}>
        <label htmlFor={id} className="text-[11.5px] font-semibold">
          Alternative text ({LANGUAGE_LABEL[language]}) <span className="font-normal text-[var(--dash-quiet)]">— what this picture shows</span>
        </label>
        <input
          id={id}
          data-alt-input=""
          className="dash-field h-8 px-2.5 text-[12.5px]"
          dir={language === 'ar' ? 'rtl' : 'ltr'}
          lang={language}
          value={alt}
          maxLength={BLOG_LIMITS.altText}
          placeholder="Describe the picture for someone who cannot see it"
          aria-invalid={missing ? true : undefined}
          aria-describedby={missing ? `${id}-error` : undefined}
          onChange={(event) => updateAttributes({ alt: event.target.value })}
        />
        {missing ? (
          <p id={`${id}-error`} className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
            Needed before publishing
          </p>
        ) : (
          <p className="text-[11px] text-[var(--dash-quiet)]">From the shared Media library. Deleting the article never deletes the file.</p>
        )}
      </div>
    </NodeViewWrapper>
  )
}

const ArticleImage = MediaImage.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ArticleImageView)
  },
})

/* ---------------------------------------------------------------- a video */

function YoutubeView({ node, updateAttributes, deleteNode, selected }: ReactNodeViewProps) {
  const { language } = useContext(ArticleContext)
  const id = useId()
  const videoId = typeof node.attrs.videoId === 'string' ? node.attrs.videoId : ''
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : ''

  return (
    <NodeViewWrapper
      className={cn(
        'my-3 overflow-hidden rounded-[10px] border',
        selected ? 'border-[var(--dash-brand)]' : 'border-[var(--dash-line)]',
      )}
      data-article-video=""
    >
      <div className="flex items-center gap-3 bg-[var(--dash-slab)] px-3.5 py-3 text-[var(--dash-slab-ink)]" contentEditable={false}>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#ff0033] text-white" aria-hidden="true">
          <Play className="size-4 fill-current" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold">{title.trim() || 'YouTube video'}</span>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="dash-num truncate text-[11.5px] text-[var(--dash-slab-quiet)] underline-offset-2 hover:underline"
          >
            youtube.com/watch?v={videoId}
          </a>
        </span>
        <button
          type="button"
          className="dash-btn size-8 shrink-0 bg-white/10 p-0 text-[var(--dash-slab-ink)] hover:bg-white/20"
          aria-label="Remove this video"
          title="Remove this video"
          onClick={() => deleteNode()}
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      <div className="flex flex-col gap-1.5 bg-[var(--dash-furniture)] px-3 py-2.5" contentEditable={false}>
        <label htmlFor={id} className="text-[11.5px] font-semibold">
          Title for screen readers ({LANGUAGE_LABEL[language]}) <span className="font-normal text-[var(--dash-quiet)]">— optional</span>
        </label>
        <input
          id={id}
          className="dash-field h-8 px-2.5 text-[12.5px]"
          dir={language === 'ar' ? 'rtl' : 'ltr'}
          lang={language}
          value={title}
          maxLength={BLOG_LIMITS.videoTitle}
          placeholder="What the video is about"
          onChange={(event) => updateAttributes({ title: event.target.value })}
        />
        <p className="text-[11px] text-[var(--dash-quiet)]">
          Visitors see a placeholder. Nothing is loaded from YouTube until they press play.
        </p>
      </div>
    </NodeViewWrapper>
  )
}

/**
 * The video node. Its group is its own, and only the document accepts that
 * group — so a list, a quote or a table cell cannot hold a player, whatever is
 * pasted. Copying one inside the editor round-trips through these data
 * attributes; nothing from a web page carries them, so an `<iframe>` from a
 * paste never becomes a video.
 */
const YoutubeVideo = Node.create({
  name: 'youtube',
  group: 'video',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      videoId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-youtube-video'),
        renderHTML: (attributes) => ({ 'data-youtube-video': attributes.videoId as string }),
      },
      start: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-start')
          const value = raw === null ? Number.NaN : Number(raw)

          return Number.isInteger(value) ? value : null
        },
        renderHTML: (attributes) => (attributes.start === null ? {} : { 'data-start': String(attributes.start) }),
      },
      title: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-title') ?? '',
        renderHTML: (attributes) => (attributes.title ? { 'data-title': attributes.title as string } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-youtube-video]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(YoutubeView)
  },
})

/** The article's top: any block, or a video. Nothing else admits a video. */
const ArticleDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: '(block | video)+',
})

/* ------------------------------------------------------- the video dialog */

function YoutubeDialog({
  language,
  onAdd,
  onClose,
}: {
  language: Language
  onAdd: (video: { videoId: string; title: string }) => void
  onClose: () => void
}) {
  const form = useForm({
    defaultValues: { url: '', title: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}

        if (value.url.trim() === '') fields.url = 'Paste the link to the video'
        else if (!youtubeVideoIdFrom(value.url)) {
          fields.url = 'That is not a YouTube video link. Copy it from the Share button on YouTube.'
        }

        if (value.title.trim().length > BLOG_LIMITS.videoTitle) {
          fields.title = `At most ${BLOG_LIMITS.videoTitle} characters`
        }

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: () => {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#youtube-form [aria-invalid="true"]')?.focus())
    },
    onSubmit: ({ value }) => {
      onAdd({ videoId: youtubeVideoIdFrom(value.url)!, title: value.title.trim() })
    },
  })

  return (
    <BlogDialog labelledBy="youtube-title" describedBy="youtube-lead" onClose={onClose}>
      <form
        id="youtube-form"
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          event.stopPropagation()
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="youtube-title">Add a YouTube video</DialogTitle>
        <p id="youtube-lead" className="text-[13px] text-[var(--dash-quiet)]">
          Paste the link from YouTube. Only the video's id is kept — never the link or any embed code.
        </p>

        <form.Field name="url">
          {(field) => {
            const error = field.state.meta.errors[0] as string | undefined
            const found = youtubeVideoIdFrom(field.state.value)

            return (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="youtube-url" className="text-[12px] font-semibold">
                  YouTube link
                </label>
                <input
                  id="youtube-url"
                  className="dash-field dash-num h-9 px-3 text-[13px]"
                  dir="ltr"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="https://www.youtube.com/watch?v=…"
                  value={field.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'youtube-url-error' : 'youtube-url-hint'}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  data-autofocus
                />
                {error ? (
                  <p id="youtube-url-error" className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                    {error}
                  </p>
                ) : (
                  <p id="youtube-url-hint" className="text-[11.5px] text-[var(--dash-quiet)]" aria-live="polite">
                    {found ? (
                      <>
                        Video found · id <span className="dash-num font-semibold text-[var(--dash-ink)]">{found}</span>
                      </>
                    ) : (
                      'youtube.com/watch?v=…, youtu.be/…, or a Shorts link'
                    )}
                  </p>
                )}
              </div>
            )
          }}
        </form.Field>

        <form.Field name="title">
          {(field) => {
            const error = field.state.meta.errors[0] as string | undefined

            return (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="youtube-video-title" className="text-[12px] font-semibold">
                  Title for screen readers ({LANGUAGE_LABEL[language]}){' '}
                  <span className="font-normal text-[var(--dash-quiet)]">— optional</span>
                </label>
                <input
                  id="youtube-video-title"
                  className="dash-field h-9 px-3 text-[13px]"
                  dir={language === 'ar' ? 'rtl' : 'ltr'}
                  lang={language}
                  maxLength={BLOG_LIMITS.videoTitle}
                  value={field.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'youtube-video-title-error' : 'youtube-video-title-hint'}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                {error ? (
                  <p id="youtube-video-title-error" className="text-[11.5px] font-medium text-[var(--dash-red-ink)]">
                    {error}
                  </p>
                ) : (
                  <p id="youtube-video-title-hint" className="text-[11.5px] text-[var(--dash-quiet)]">
                    Names the video for people who cannot see it.
                  </p>
                )}
              </div>
            )
          }}
        </form.Field>

        <DialogActions>
          <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="dash-btn dash-btn-primary">
            Add video
          </button>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

/* ---------------------------------------------------------------- editor */

const editableAttributes = (id: string, labelId: string, error: string | undefined): Record<string, string> => ({
  id,
  role: 'textbox',
  'aria-multiline': 'true',
  'aria-labelledby': labelId,
  ...(error ? { 'aria-invalid': 'true', 'aria-describedby': `${id}-error` } : {}),
})

export function BlogBodyEditor({
  id,
  value,
  language,
  onChange,
  attempted,
  error,
}: {
  /** The element the checklist and a failed publish send focus to. */
  id: string
  value: BlogDoc
  language: Language
  onChange: (doc: BlogDoc) => void
  /** After a refused Publish, every picture without a description says so. */
  attempted: boolean
  error?: string
}) {
  const [picking, setPicking] = useState(false)
  const [addingVideo, setAddingVideo] = useState(false)
  const [words, setWords] = useState(() => ({
    count: countWords(blogPlainText(value)),
    minutes: readingMinutesOf(value),
  }))
  const labelId = `${id}-label`

  const editor = useEditor({
    // The page is server-rendered; rendering the editor during SSR throws.
    immediatelyRender: false,
    extensions: [
      ArticleDocument,
      StarterKit.configure({
        document: false,
        heading: { levels: [2, 3, 4] },
        link: { openOnClick: false, autolink: true, protocols: ['http', 'https', 'mailto'] },
      }),
      ArticleImage.configure({ inline: false, allowBase64: false }),
      TableKit.configure({ table: { resizable: false } }),
      YoutubeVideo,
    ],
    content: value.content.length > 0 ? value : { type: 'doc', content: [{ type: 'paragraph' }] },
    editorProps: { attributes: editableAttributes(id, labelId, error) },
    onUpdate: ({ editor: instance }) => {
      const doc = normalizeBlogDoc(instance.getJSON())

      setWords({ count: countWords(blogPlainText(doc)), minutes: readingMinutesOf(doc) })
      onChange(doc)
    },
  })

  // The invalid state is an attribute of the editable element itself, so a
  // screen reader hears it where the caret is.
  useEffect(() => {
    editor?.setOptions({ editorProps: { attributes: editableAttributes(id, labelId, error) } })
  }, [editor, id, labelId, error])

  const insertImage = (asset: MediaAsset) => {
    editor
      ?.chain()
      .focus()
      .insertContent({
        type: 'image',
        attrs: { mediaId: asset.id, alt: '', width: asset.width ?? null, height: asset.height ?? null },
      })
      .run()

    setPicking(false)
  }

  /**
   * A video goes after the block the caret is in — never inside it — and
   * takes the place of an empty paragraph rather than leaving one behind.
   */
  const insertVideo = (video: { videoId: string; title: string }) => {
    setAddingVideo(false)

    if (!editor) return

    const { state } = editor
    const { $from } = state.selection
    const node = { type: 'youtube', attrs: { videoId: video.videoId, start: null, title: video.title } }

    if ($from.depth === 0) {
      editor.chain().focus().insertContentAt(state.selection.to, node).run()

      return
    }

    const top = $from.node(1)
    const range =
      top.type.name === 'paragraph' && top.content.size === 0
        ? { from: $from.before(1), to: $from.after(1) }
        : $from.after(1)

    editor.chain().focus().insertContentAt(range, node).run()
  }

  const videoCount = value.content.filter((node) => node.type === 'youtube').length

  return (
    <ArticleContext.Provider value={{ language, attempted }}>
      <div className="flex flex-col gap-1.5">
        <span id={labelId} className="text-[12px] font-semibold">
          Article
        </span>
        <div
          className={cn(
            'overflow-hidden rounded-[10px] border bg-[var(--dash-input)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--dash-blue)]',
            error ? 'border-[var(--dash-red)]' : 'border-[var(--dash-line)]',
          )}
        >
          {editor ? (
            <Toolbar
              editor={editor}
              onPickImage={() => setPicking(true)}
              extra={
                <button
                  type="button"
                  title="YouTube video"
                  aria-label="YouTube video"
                  disabled={videoCount >= BLOG_LIMITS.videosPerLanguage}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setAddingVideo(true)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)] disabled:opacity-40"
                >
                  <SquarePlay className="size-4" aria-hidden="true" />
                  YouTube
                </button>
              }
            />
          ) : (
            <div className="h-11 border-b border-[var(--dash-line)]" aria-hidden="true" />
          )}

          <EditorContent
            editor={editor}
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            lang={language}
            className={cn(
              RICH_TEXT_CONTENT_CLASS,
              // The editable area fills the box, so a click anywhere in it starts writing.
              'min-h-64 text-[14px] [&_.ProseMirror]:min-h-56',
              language === 'ar' && 'font-[family-name:var(--font-arabic)]',
            )}
          />

          <p className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--dash-line)] px-3.5 py-2 text-[11.5px] text-[var(--dash-quiet)]">
            <span className="dash-num">
              {words.count.toLocaleString('en')} {words.count === 1 ? 'word' : 'words'} · {words.minutes} min read
            </span>
            <span>The YouTube button keeps the video's id, never embed code.</span>
          </p>
        </div>
        {error ? (
          <p id={`${id}-error`} className="flex items-center gap-1.5 text-[11.5px] font-medium text-[var(--dash-red-ink)]">
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : null}
      </div>

      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onChoose={insertImage}
        kind="image"
        title="Choose a picture for the article"
        description="It is added to your Media library first, then placed in the article."
      />

      {addingVideo ? <YoutubeDialog language={language} onAdd={insertVideo} onClose={() => setAddingVideo(false)} /> : null}
    </ArticleContext.Provider>
  )
}
