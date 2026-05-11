export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  streaming: boolean
}

export interface HighlightDirective {
  norad_id: string
  satellite_name: string
}
