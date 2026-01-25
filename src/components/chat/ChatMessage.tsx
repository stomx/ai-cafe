'use client';

import type { ChatMessage as ChatMessageType } from '@/types/chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <div className={`chat-message ${isUser ? 'user' : 'assistant'} ${message.isInterim ? 'interim' : ''}`}>
      {!isUser && !isSystem && (
        <div className="chat-avatar">
          <span>☕</span>
        </div>
      )}
      <div className="chat-bubble">
        <p className="chat-content">{message.content}</p>
        {message.isInterim && (
          <span className="chat-interim-indicator">듣는 중...</span>
        )}
      </div>
      {isUser && (
        <div className="chat-avatar user">
          <span>🎤</span>
        </div>
      )}
    </div>
  );
}
