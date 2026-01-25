'use client';

import { useEffect, useRef } from 'react';
import { ChatMessage } from './ChatMessage';
import { useChatStore } from '@/store/chatStore';

interface ChatContainerProps {
  className?: string;
}

export function ChatContainer({ className = '' }: ChatContainerProps) {
  const messages = useChatStore((state) => state.messages);
  const isTyping = useChatStore((state) => state.isTyping);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  return (
    <div className={`chat-container ${className}`}>
      <div className="chat-messages" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="text-4xl mb-2 opacity-50">💬</div>
            <p>음성으로 주문해주세요</p>
            <p className="chat-empty-hint">
              &ldquo;아이스 아메리카노 한 잔 주세요&rdquo;
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}
            {isTyping && (
              <div className="chat-message assistant">
                <div className="chat-avatar">
                  <span>☕</span>
                </div>
                <div className="chat-bubble typing">
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                  <span className="typing-dot"></span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
