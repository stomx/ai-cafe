import { create } from 'zustand';
import type { AIStoreState, AIModelState, AIModelStatus } from '@/types/ai';

const initialModelState: AIModelState = {
  status: 'idle',
  progress: 0,
};

export const useAIStore = create<AIStoreState>((set, get) => ({
  faceDetection: { ...initialModelState },
  stt: { ...initialModelState },
  tts: { ...initialModelState },
  llm: { ...initialModelState },

  setModelStatus: (model, status) => set((state) => ({
    [model]: { ...state[model], status, error: status === 'error' ? state[model].error : undefined }
  })),

  setModelProgress: (model, progress) => set((state) => ({
    [model]: { ...state[model], progress }
  })),

  setModelError: (model, error) => set((state) => ({
    [model]: { ...state[model], status: 'error' as AIModelStatus, error }
  })),

  isAllReady: () => {
    const state = get();
    const models: Array<'faceDetection' | 'stt' | 'tts' | 'llm'> = ['faceDetection', 'stt', 'tts', 'llm'];
    return models.every(
      (model) => state[model].status === 'ready' || state[model].status === 'fallback'
    );
  },

  isAnyLoading: () => {
    const state = get();
    const models: Array<'faceDetection' | 'stt' | 'tts' | 'llm'> = ['faceDetection', 'stt', 'tts', 'llm'];
    return models.some(
      (model) => state[model].status === 'loading'
    );
  },
}));
