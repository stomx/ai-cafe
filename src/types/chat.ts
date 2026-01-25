export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isInterim?: boolean; // For interim speech results
}

export interface ChatState {
  messages: ChatMessage[];
  isTyping: boolean;
}
