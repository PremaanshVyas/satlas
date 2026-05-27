export type MessageRole = 'user' | 'assistant'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  streaming: boolean
  timestamp: number
}

export interface HighlightDirective {
  norad_id: string
  satellite_name: string
  latitude?: number   // decimal degrees — present when get_satellite_info was called
  longitude?: number  // decimal degrees — present when get_satellite_info was called
}

export interface SetFilterDirective {
  categories: ('STARLINK' | 'GPS' | 'IRIDIUM' | 'DEBRIS' | 'OTHER')[]
}

export interface SpotlightDirective {
  norad_id: string
  satellite_name: string
}
