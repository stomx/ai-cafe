/**
 * Supertonic TTS Type Definitions
 */

// Available languages
export const AVAILABLE_LANGS = ['en', 'ko', 'es', 'pt', 'fr'] as const;
export type Language = typeof AVAILABLE_LANGS[number];

// Voice style info
export interface VoiceInfo {
  id: string;           // e.g., 'F1'
  name: string;         // e.g., '여성 1'
  language: Language;
  gender: 'male' | 'female';
  path: string;         // JSON file path
}

// TTS Configuration from tts.json
export interface TTSConfig {
  ae: {
    sample_rate: number;
    base_chunk_size: number;
  };
  ttl: {
    chunk_compress_factor: number;
    latent_dim: number;
  };
}

// ONNX Tensor type (generic since loaded from CDN)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OnnxTensor = any;

// Style tensors
export interface StyleTensors {
  ttl: OnnxTensor;
  dp: OnnxTensor;
}

// Speak options
export interface SpeakOptions {
  voice?: string;
  speed?: number;
  volume?: number;  // 0.0 ~ 2.0+, 기본값 1.5
  totalStep?: number;
  silenceDuration?: number;
  onProgress?: (step: number, total: number) => void;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

// TTS Engine interface (for adapter pattern)
export interface TTSEngine {
  readonly name: string;
  readonly isLoaded: boolean;
  readonly isSpeaking: boolean;
  readonly loadProgress: number;
  readonly sampleRate: number;

  load(onProgress?: (progress: number, message: string) => void): Promise<void>;
  speak(text: string, lang: Language, options?: SpeakOptions): Promise<void>;
  stop(): void;
  dispose(): Promise<void>;
}

// Load progress callback
export type LoadProgressCallback = (
  modelName: string,
  current: number,
  total: number
) => void;

// Inference progress callback
export type InferProgressCallback = (
  step: number,
  totalStep: number
) => void;

// Voice style JSON structure
export interface VoiceStyleJSON {
  style_ttl: {
    dims: number[];
    data: number[][][];
  };
  style_dp: {
    dims: number[];
    data: number[][][];
  };
}

// Unicode indexer type
export type UnicodeIndexer = number[];

// Default voice styles (multilingual - supports ko, en, es, pt, fr)
export const DEFAULT_VOICES: VoiceInfo[] = [
  { id: 'F1', name: '여성 1', language: 'ko', gender: 'female', path: '/tts/voice_styles/F1.json' },
  { id: 'F2', name: '여성 2', language: 'ko', gender: 'female', path: '/tts/voice_styles/F2.json' },
  { id: 'F3', name: '여성 3', language: 'ko', gender: 'female', path: '/tts/voice_styles/F3.json' },
  { id: 'F4', name: '여성 4', language: 'ko', gender: 'female', path: '/tts/voice_styles/F4.json' },
  { id: 'F5', name: '여성 5', language: 'ko', gender: 'female', path: '/tts/voice_styles/F5.json' },
  { id: 'M1', name: '남성 1', language: 'ko', gender: 'male', path: '/tts/voice_styles/M1.json' },
  { id: 'M2', name: '남성 2', language: 'ko', gender: 'male', path: '/tts/voice_styles/M2.json' },
  { id: 'M3', name: '남성 3', language: 'ko', gender: 'male', path: '/tts/voice_styles/M3.json' },
  { id: 'M4', name: '남성 4', language: 'ko', gender: 'male', path: '/tts/voice_styles/M4.json' },
  { id: 'M5', name: '남성 5', language: 'ko', gender: 'male', path: '/tts/voice_styles/M5.json' },
];
