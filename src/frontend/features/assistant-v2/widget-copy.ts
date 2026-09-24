import type { AssistantLanguage } from '#/backend2/contracts/assistant.contract'

/**
 * The public widget's privacy notice (`features/chat/ChatWidget.tsx`), in the
 * wording the owner approved in the Assistant Design Lab (24 Sep 2026,
 * `docs/v2/ai-assistant.md`).
 *
 * It says plainly that Yaman reads the conversations (he does), and matches
 * the notice the server sends with the assistant status.
 */

export const ASSISTANT_V2_NOTICE_KEY = 'assistant.notice.v2'

export type AssistantV2Notice = {
  /** The strip under the widget's header. */
  notice: string
  /** The link beside it, to the privacy page. */
  privacy: string
  privacyPath: string
}

export const assistantV2Notice: Record<AssistantLanguage, AssistantV2Notice> = {
  de: {
    notice: 'Automatische Antworten aus dieser Website. Gespräche werden gespeichert und von Yaman gelesen, damit er die Seite verbessern kann. Bitte gib keine persönlichen Daten ein.',
    privacy: 'Datenschutz',
    privacyPath: '/de/datenschutz',
  },
  en: {
    notice: 'Automatic answers from this website. Conversations are saved and read by Yaman so he can improve the site. Please do not enter personal information.',
    privacy: 'Privacy',
    privacyPath: '/en/datenschutz',
  },
  ar: {
    notice: 'ردود آلية من هذا الموقع. تُحفظ المحادثات ويقرؤها يمان ليحسّن الموقع. يُرجى عدم كتابة معلومات شخصية.',
    privacy: 'الخصوصية',
    privacyPath: '/ar/datenschutz',
  },
}
