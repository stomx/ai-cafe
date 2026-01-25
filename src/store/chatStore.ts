import { create } from 'zustand';
import type { ChatMessage, MessageRole } from '@/types/chat';

interface ChatStore {
  messages: ChatMessage[];
  isTyping: boolean;

  addMessage: (role: MessageRole, content: string, isInterim?: boolean) => string;
  updateMessage: (id: string, content: string, isInterim?: boolean) => void;
  removeMessage: (id: string) => void;
  setTyping: (isTyping: boolean) => void;
  clearMessages: () => void;

  // Helper to add system greeting
  addGreeting: () => void;
  // Helper to add user voice input
  addUserVoice: (content: string, isInterim?: boolean) => string;
  // Helper to add assistant response
  addAssistantResponse: (content: string) => void;
}

const generateId = () => `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  isTyping: false,

  addMessage: (role, content, isInterim = false) => {
    const id = generateId();
    const message: ChatMessage = {
      id,
      role,
      content,
      timestamp: Date.now(),
      isInterim,
    };

    set((state) => ({
      messages: [...state.messages, message],
    }));

    return id;
  },

  updateMessage: (id, content, isInterim) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id
          ? { ...msg, content, isInterim: isInterim ?? msg.isInterim }
          : msg
      ),
    }));
  },

  removeMessage: (id) => {
    set((state) => ({
      messages: state.messages.filter((msg) => msg.id !== id),
    }));
  },

  setTyping: (isTyping) => {
    set({ isTyping });
  },

  clearMessages: () => {
    set({ messages: [], isTyping: false });
  },

  addGreeting: () => {
    const { addMessage } = get();
    addMessage('assistant', '안녕하세요! 무엇을 주문하시겠어요? 🎤');
  },

  addUserVoice: (content, isInterim = false) => {
    const { addMessage } = get();
    return addMessage('user', content, isInterim);
  },

  addAssistantResponse: (content) => {
    const { addMessage, setTyping } = get();
    setTyping(false);
    addMessage('assistant', content);
  },
}));
