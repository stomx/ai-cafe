export type AIModelStatus = 'idle' | 'loading' | 'ready' | 'error' | 'fallback';

export interface AIModelState {
  status: AIModelStatus;
  progress: number;  // 0-100
  error?: string;
}

export interface AIStoreState {
  faceDetection: AIModelState;
  stt: AIModelState;
  tts: AIModelState;
  llm: AIModelState;

  setModelStatus: (model: keyof Omit<AIStoreState, 'setModelStatus' | 'setModelProgress' | 'setModelError' | 'isAllReady' | 'isAnyLoading'>, status: AIModelStatus) => void;
  setModelProgress: (model: keyof Omit<AIStoreState, 'setModelStatus' | 'setModelProgress' | 'setModelError' | 'isAllReady' | 'isAnyLoading'>, progress: number) => void;
  setModelError: (model: keyof Omit<AIStoreState, 'setModelStatus' | 'setModelProgress' | 'setModelError' | 'isAllReady' | 'isAnyLoading'>, error: string) => void;
  isAllReady: () => boolean;
  isAnyLoading: () => boolean;
}

// Worker message types
export interface WorkerMessage {
  type: 'init' | 'process' | 'status' | 'result' | 'error' | 'progress';
  payload?: unknown;
}

export interface STTResult {
  text: string;
  confidence: number;
  isFinal: boolean;
}

export interface TTSRequest {
  text: string;
  voice?: string;
  speed?: number;
}

export interface LLMRequest {
  prompt: string;
  context?: string;
}

export interface LLMResponse {
  text: string;
  parsed?: {
    items: Array<{
      name: string;
      quantity: number;
      temperature?: 'HOT' | 'ICE';
    }>;
    action?: 'add' | 'remove' | 'modify' | 'confirm' | 'cancel';
  };
}
