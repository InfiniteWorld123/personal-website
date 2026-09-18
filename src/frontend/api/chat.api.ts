import type { ChatAnswer, ChatIntro } from '#/shared/types/chat.types'
import type { ChatLanguage } from '#/shared/validation/chat.validation'
import { api } from './client'
import { unwrap } from './response'

/**
 * Talking to the assistant (D34).
 *
 * Transport only, as every API module here is. The conversation id is not
 * kept in this file: the widget owns it, because it is the widget's session
 * that the id belongs to and no other caller should be able to continue
 * someone else's conversation by importing a module-level variable.
 */

export async function fetchChatIntro(language: ChatLanguage): Promise<ChatIntro> {
  return unwrap<ChatIntro>(await api().chat.intro({ language }).get())
}

export async function askAssistant(input: {
  message: string
  language: ChatLanguage
  conversationId?: string
  path?: string
}): Promise<ChatAnswer> {
  return unwrap<ChatAnswer>(await api().chat.ask.post(input))
}
