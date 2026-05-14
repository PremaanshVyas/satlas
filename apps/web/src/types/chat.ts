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
  latitude?: number   // decimal degrees — present when get_satellite_info was called
  longitude?: number  // decimal degrees — present when get_satellite_info was called
}

export interface GroupHighlightDirective {
  category: 'STARLINK' | 'GPS' | 'IRIDIUM' | 'DEBRIS' | 'OTHER'
}
