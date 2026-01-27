/**
 * Supertonic TTS Engine
 * Ported from: https://github.com/supertone-inc/supertonic/blob/main/web/helper.js
 */

import {
  TTSEngine,
  TTSConfig,
  StyleTensors,
  Language,
  SpeakOptions,
  VoiceStyleJSON,
  UnicodeIndexer,
  AVAILABLE_LANGS,
} from './types';

// Type for ONNX Runtime (loaded from CDN)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrtModule = any;

// ONNX Runtime CDN URL
const ORT_CDN_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/ort.min.js';

// Cache name for TTS models
const TTS_CACHE_NAME = 'supertonic-tts-v1';

// TTS ONNX 모델 CDN URL (환경변수로 설정)
// 로컬: /tts/onnx, 운영: https://assets.stomx.net/tts/onnx
const TTS_CDN_URL = process.env.NEXT_PUBLIC_TTS_CDN_URL || '/tts/onnx';

// ============================================================================
// Cache Utilities
// ============================================================================

/**
 * Fetch with cache - tries cache first, then network
 * Returns Response object
 */
async function fetchWithCache(url: string): Promise<Response> {
  if (typeof caches === 'undefined') {
    // Cache API not available, fallback to regular fetch
    return fetch(url);
  }

  try {
    const cache = await caches.open(TTS_CACHE_NAME);

    // Try cache first
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
      console.log(`[TTS Cache] Hit: ${url.split('/').pop()}`);
      return cachedResponse;
    }

    // Cache miss - fetch from network
    console.log(`[TTS Cache] Miss: ${url.split('/').pop()}`);
    const networkResponse = await fetch(url);

    if (networkResponse.ok) {
      // Clone response before caching (response can only be consumed once)
      await cache.put(url, networkResponse.clone());
      console.log(`[TTS Cache] Stored: ${url.split('/').pop()}`);
    }

    return networkResponse;
  } catch (error) {
    console.warn('[TTS Cache] Error, falling back to network:', error);
    return fetch(url);
  }
}

/**
 * Fetch ArrayBuffer with cache - for ONNX models
 */
async function fetchArrayBufferWithCache(url: string): Promise<ArrayBuffer> {
  const response = await fetchWithCache(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${url}`);
  }
  return response.arrayBuffer();
}

/**
 * Fetch JSON with cache - for config files
 */
async function fetchJsonWithCache<T>(url: string): Promise<T> {
  const response = await fetchWithCache(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${url}`);
  }
  return response.json();
}

/**
 * Get cache storage info
 */
export async function getTTSCacheInfo(): Promise<{
  cached: boolean;
  fileCount?: number;
  sizeEstimate?: number;
}> {
  if (typeof caches === 'undefined') {
    return { cached: false };
  }

  try {
    const cache = await caches.open(TTS_CACHE_NAME);
    const keys = await cache.keys();

    if (keys.length === 0) {
      return { cached: false };
    }

    // Estimate size if storage API is available
    if (navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      return {
        cached: true,
        fileCount: keys.length,
        sizeEstimate: estimate.usage
      };
    }

    return { cached: true, fileCount: keys.length };
  } catch {
    return { cached: false };
  }
}

// Internal alias for backward compatibility
const getCacheInfo = getTTSCacheInfo;

/**
 * Clear TTS cache
 */
export async function clearTTSCache(): Promise<boolean> {
  if (typeof caches === 'undefined') {
    return false;
  }

  try {
    const deleted = await caches.delete(TTS_CACHE_NAME);
    console.log(`[TTS Cache] Cleared: ${deleted}`);
    return deleted;
  } catch (error) {
    console.error('[TTS Cache] Clear failed:', error);
    return false;
  }
}

// Load ONNX Runtime from CDN
async function loadOnnxRuntimeFromCDN(): Promise<OrtModule> {
  // Check if already loaded
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof window !== 'undefined' && (window as any).ort) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).ort;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = ORT_CDN_URL;
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ort = (window as any).ort;
      if (ort) {
        resolve(ort);
      } else {
        reject(new Error('ONNX Runtime not found after loading script'));
      }
    };
    script.onerror = () => reject(new Error('Failed to load ONNX Runtime from CDN'));
    document.head.appendChild(script);
  });
}

// ============================================================================
// Korean Text Preprocessing
// ============================================================================

// 고유어 수사 (1-99까지 지원)
const NATIVE_KOREAN_NUMBERS: Record<number, string> = {
  1: '한', 2: '두', 3: '세', 4: '네', 5: '다섯',
  6: '여섯', 7: '일곱', 8: '여덟', 9: '아홉', 10: '열',
  20: '스물', 30: '서른', 40: '마흔', 50: '쉰',
  60: '예순', 70: '일흔', 80: '여든', 90: '아흔',
};

// 고유어 수사를 사용하는 단위명사
const NATIVE_COUNTERS = [
  '잔', '개', '명', '분', '시', '살', '병', '그릇', '마리',
  '송이', '장', '권', '대', '벌', '켤레', '쌍', '줄', '번',
  '가지', '군데', '곳', '통', '포기', '채', '척', '자루',
];

// 영어 단어 → 한국어 발음 매핑 (대소문자 무관)
const ENGLISH_TO_KOREAN: Record<string, string> = {
  // 온도/상태
  'hot': '핫', 'ice': '아이스', 'iced': '아이스드', 'cold': '콜드',
  // 사이즈
  'small': '스몰', 'medium': '미디엄', 'large': '라지', 'tall': '톨', 'grande': '그란데', 'venti': '벤티',
  // 커피 종류
  'americano': '아메리카노', 'latte': '라떼', 'mocha': '모카', 'espresso': '에스프레소',
  'cappuccino': '카푸치노', 'macchiato': '마키아토', 'frappuccino': '프라푸치노',
  'coffee': '커피', 'decaf': '디카페인', 'shot': '샷', 'extra': '엑스트라',
  // 우유/시럽
  'milk': '밀크', 'oat': '오트', 'soy': '소이', 'almond': '아몬드',
  'vanilla': '바닐라', 'caramel': '카라멜', 'hazelnut': '헤이즐넛', 'syrup': '시럽',
  // 기타 음료
  'tea': '티', 'green': '그린', 'black': '블랙', 'smoothie': '스무디',
  'juice': '주스', 'lemonade': '레모네이드', 'chocolate': '초콜릿',
  // 일반
  'ok': '오케이', 'yes': '예스', 'no': '노', 'please': '플리즈',
  'thank': '땡큐', 'thanks': '땡스', 'sorry': '쏘리', 'hello': '헬로', 'hi': '하이',
  // 브랜드/메뉴
  'blend': '블렌드', 'roast': '로스트', 'cream': '크림', 'whip': '휩',
  'topping': '토핑', 'drizzle': '드리즐', 'foam': '폼',
};

function convertToNativeKorean(num: number): string | null {
  if (num < 1 || num > 99) return null;

  if (num <= 10) return NATIVE_KOREAN_NUMBERS[num] || null;

  const tens = Math.floor(num / 10) * 10;
  const ones = num % 10;

  if (ones === 0) return NATIVE_KOREAN_NUMBERS[tens] || null;

  const tensWord = NATIVE_KOREAN_NUMBERS[tens];
  const onesWord = NATIVE_KOREAN_NUMBERS[ones];

  if (!tensWord || !onesWord) return null;
  return `${tensWord}${onesWord}`;  // 스물셋, 서른넷 등
}

function convertNumbersWithCounters(text: string): string {
  // 숫자 + 단위명사 패턴 매칭
  const counterPattern = new RegExp(
    `(\\d{1,2})\\s*(${NATIVE_COUNTERS.join('|')})`,
    'g'
  );

  return text.replace(counterPattern, (match, numStr, counter) => {
    const num = parseInt(numStr, 10);
    const nativeNum = convertToNativeKorean(num);

    if (nativeNum) {
      return `${nativeNum} ${counter}`;  // "세 잔", "두 개"
    }
    return match;  // 변환 실패시 원본 유지
  });
}

function convertEnglishToKorean(text: string): string {
  // 영어 단어를 한국어 발음으로 변환
  // 단어 경계를 고려하여 매칭 (대소문자 무관)
  let result = text;

  for (const [eng, kor] of Object.entries(ENGLISH_TO_KOREAN)) {
    // 단어 경계를 고려한 정규식 (대소문자 무관)
    const pattern = new RegExp(`\\b${eng}\\b`, 'gi');
    result = result.replace(pattern, kor);
  }

  return result;
}

function preprocessKoreanText(text: string): string {
  // 1. 영어 단어를 한국어 발음으로 변환
  text = convertEnglishToKorean(text);

  // 2. 숫자 + 단위명사를 고유어로 변환
  text = convertNumbersWithCounters(text);

  return text;
}

// ============================================================================
// Unicode Processor
// ============================================================================

class UnicodeProcessor {
  private indexer: UnicodeIndexer;

  constructor(indexer: UnicodeIndexer) {
    this.indexer = indexer;
  }

  call(textList: string[], langList: Language[]): { textIds: number[][]; textMask: number[][][] } {
    const processedTexts = textList.map((text, i) => this.preprocessText(text, langList[i]));

    const textIdsLengths = processedTexts.map(text => text.length);
    const maxLen = Math.max(...textIdsLengths);

    const textIds = processedTexts.map(text => {
      const row = new Array(maxLen).fill(0);
      for (let j = 0; j < text.length; j++) {
        const codePoint = text.codePointAt(j) || 0;
        row[j] = (codePoint < this.indexer.length) ? this.indexer[codePoint] : -1;
      }
      return row;
    });

    const textMask = this.getTextMask(textIdsLengths);
    return { textIds, textMask };
  }

  private preprocessText(text: string, lang: Language): string {
    // Korean-specific preprocessing
    if (lang === 'ko') {
      text = preprocessKoreanText(text);
    }

    // Normalize
    text = text.normalize('NFKD');

    // Remove emojis
    const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu;
    text = text.replace(emojiPattern, '');

    // Replace various dashes and symbols
    const replacements: Record<string, string> = {
      '–': '-', '‑': '-', '—': '-', '_': ' ',
      '\u201C': '"', '\u201D': '"', '\u2018': "'", '\u2019': "'",
      '´': "'", '`': "'", '[': ' ', ']': ' ', '|': ' ', '/': ' ',
      '#': ' ', '→': ' ', '←': ' ',
    };
    for (const [k, v] of Object.entries(replacements)) {
      text = text.replaceAll(k, v);
    }

    // Remove special symbols
    text = text.replace(/[♥☆♡©\\]/g, '');

    // Replace known expressions
    const exprReplacements: Record<string, string> = {
      '@': ' at ',
      'e.g.,': 'for example, ',
      'i.e.,': 'that is, ',
    };
    for (const [k, v] of Object.entries(exprReplacements)) {
      text = text.replaceAll(k, v);
    }

    // Fix spacing around punctuation
    text = text.replace(/ ,/g, ',').replace(/ \./g, '.').replace(/ !/g, '!');
    text = text.replace(/ \?/g, '?').replace(/ ;/g, ';').replace(/ :/g, ':').replace(/ '/g, "'");

    // Remove duplicate quotes
    while (text.includes('""')) text = text.replace('""', '"');
    while (text.includes("''")) text = text.replace("''", "'");

    // Remove extra spaces
    text = text.replace(/\s+/g, ' ').trim();

    // Add period if needed
    if (!/[.!?;:,'\"')\]}…。」』】〉》›»]$/.test(text)) {
      text += '.';
    }

    // Validate language
    if (!AVAILABLE_LANGS.includes(lang)) {
      throw new Error(`Invalid language: ${lang}. Available: ${AVAILABLE_LANGS.join(', ')}`);
    }

    // Wrap text with language tags
    return `<${lang}>${text}</${lang}>`;
  }

  private getTextMask(textIdsLengths: number[]): number[][][] {
    const maxLen = Math.max(...textIdsLengths);
    return this.lengthToMask(textIdsLengths, maxLen);
  }

  private lengthToMask(lengths: number[], maxLen?: number): number[][][] {
    const actualMaxLen = maxLen || Math.max(...lengths);
    return lengths.map(len => {
      const row = new Array(actualMaxLen).fill(0.0);
      for (let j = 0; j < Math.min(len, actualMaxLen); j++) {
        row[j] = 1.0;
      }
      return [row];
    });
  }
}

// ============================================================================
// Text Chunking
// ============================================================================

function chunkText(text: string, maxLen: number = 300): string[] {
  if (typeof text !== 'string') {
    throw new Error(`chunkText expects a string, got ${typeof text}`);
  }

  const paragraphs = text.trim().split(/\n\s*\n+/).filter(p => p.trim());
  const chunks: string[] = [];

  for (let paragraph of paragraphs) {
    paragraph = paragraph.trim();
    if (!paragraph) continue;

    // Split by sentence boundaries
    const sentences = paragraph.split(/(?<!Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sr\.|Jr\.|Ph\.D\.|etc\.|e\.g\.|i\.e\.|vs\.|Inc\.|Ltd\.|Co\.|Corp\.|St\.|Ave\.|Blvd\.)(?<!\b[A-Z]\.)(?<=[.!?])\s+/);

    let currentChunk = "";

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length + 1 <= maxLen) {
        currentChunk += (currentChunk ? " " : "") + sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
  }

  return chunks.length > 0 ? chunks : [text];
}

// ============================================================================
// WAV File Writer
// ============================================================================

function writeWavFile(audioData: number[], sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = audioData.length * 2;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // WAV header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Audio data
  const int16Data = new Int16Array(audioData.length);
  for (let i = 0; i < audioData.length; i++) {
    const clamped = Math.max(-1.0, Math.min(1.0, audioData[i]));
    int16Data[i] = Math.floor(clamped * 32767);
  }

  const dataView = new Uint8Array(buffer, 44);
  dataView.set(new Uint8Array(int16Data.buffer));

  return buffer;
}

// ============================================================================
// Supertonic TTS Engine
// ============================================================================

export class SupertonicTTS implements TTSEngine {
  readonly name = 'supertonic';
  private _isLoaded = false;
  private _loadProgress = 0;
  private _sampleRate = 24000;
  private _isSpeaking = false;
  private _stopRequested = false;

  private ort: OrtModule | null = null;
  private config: TTSConfig | null = null;
  private textProcessor: UnicodeProcessor | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private dpSession: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private textEncSession: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private vectorEstSession: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private vocoderSession: any = null;

  private currentStyle: StyleTensors | null = null;
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private _volume: number = 2; // 기본 음량 2배

  private basePath: string;

  constructor(basePath: string = '/tts/onnx') {
    this.basePath = basePath;
  }

  get isLoaded(): boolean {
    return this._isLoaded;
  }

  get loadProgress(): number {
    return this._loadProgress;
  }

  get sampleRate(): number {
    return this._sampleRate;
  }

  get isSpeaking(): boolean {
    return this._isSpeaking;
  }

  async load(onProgress?: (progress: number, message: string) => void): Promise<void> {
    try {
      // Check cache status
      const cacheInfo = await getCacheInfo();
      if (cacheInfo.cached) {
        console.log('[TTS] Using cached models');
      }

      // 0. Load ONNX Runtime from CDN (browser only)
      onProgress?.(2, 'ONNX Runtime 로딩...');
      this.ort = await loadOnnxRuntimeFromCDN();

      // 1. Load config (5%) - with cache
      onProgress?.(5, '설정 파일 로딩...');
      this.config = await fetchJsonWithCache<TTSConfig>(`${this.basePath}/tts.json`);
      this._sampleRate = this.config.ae.sample_rate;

      // 2. Load unicode indexer (10%) - with cache
      onProgress?.(10, '텍스트 처리기 로딩...');
      const indexer = await fetchJsonWithCache<UnicodeIndexer>(`${this.basePath}/unicode_indexer.json`);
      this.textProcessor = new UnicodeProcessor(indexer);

      // Session options (typed as any since we load from CDN)
      const sessionOptions = {
        executionProviders: ['webgpu', 'wasm'],
        graphOptimizationLevel: 'all',
      };

      // 3. Load ONNX models (10-90%) - with cache
      // ONNX files are loaded from GitHub Releases (Cloudflare Pages 25MB limit)
      const models = [
        { name: 'duration_predictor', label: 'Duration Predictor' },
        { name: 'text_encoder', label: 'Text Encoder' },
        { name: 'vector_estimator', label: 'Vector Estimator' },
        { name: 'vocoder', label: 'Vocoder' },
      ];

      for (let i = 0; i < models.length; i++) {
        const model = models[i];
        const progress = 10 + ((i + 1) / models.length) * 80;
        const isCached = cacheInfo.cached ? ' (캐시)' : '';
        onProgress?.(progress, `${model.label} 로딩...${isCached}`);
        this._loadProgress = progress;

        // Load ONNX from CDN (R2) or local path
        const modelUrl = `${TTS_CDN_URL}/${model.name}.onnx`;
        const modelBuffer = await fetchArrayBufferWithCache(modelUrl);

        const session = await this.ort.InferenceSession.create(
          modelBuffer,
          sessionOptions
        );

        switch (model.name) {
          case 'duration_predictor': this.dpSession = session; break;
          case 'text_encoder': this.textEncSession = session; break;
          case 'vector_estimator': this.vectorEstSession = session; break;
          case 'vocoder': this.vocoderSession = session; break;
        }
      }

      // 4. Initialize AudioContext
      this.audioContext = new AudioContext({ sampleRate: this._sampleRate });

      this._isLoaded = true;
      this._loadProgress = 100;
      onProgress?.(100, '로딩 완료!');

    } catch (error) {
      this._isLoaded = false;
      throw error;
    }
  }

  async loadVoiceStyle(stylePath: string): Promise<StyleTensors> {
    if (!this.ort) throw new Error('ONNX Runtime not loaded');

    // Load voice style with cache
    const styleData = await fetchJsonWithCache<VoiceStyleJSON>(stylePath);

    const ttlFlat = new Float32Array(styleData.style_ttl.data.flat(Infinity) as number[]);
    const dpFlat = new Float32Array(styleData.style_dp.data.flat(Infinity) as number[]);

    const ttlTensor = new this.ort.Tensor('float32', ttlFlat, styleData.style_ttl.dims);
    const dpTensor = new this.ort.Tensor('float32', dpFlat, styleData.style_dp.dims);

    return { ttl: ttlTensor, dp: dpTensor };
  }

  async speak(text: string, lang: Language, options: SpeakOptions = {}): Promise<void> {
    if (!this._isLoaded) {
      throw new Error('TTS engine not loaded. Call load() first.');
    }

    // Stop any ongoing speech first
    if (this._isSpeaking) {
      console.log('[TTS] Stopping previous speech before starting new one');
      this.stop();
      // Small delay to ensure audio stops cleanly
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const {
      voice = '/tts/voice_styles/F1.json',
      speed = 1.2,
      volume = 2,
      totalStep = 30,
      silenceDuration = 0.3,
      onProgress,
      onStart,
      onEnd,
      onError,
    } = options;

    // Set volume
    this._volume = volume;

    try {
      this._isSpeaking = true;
      this._stopRequested = false;
      onStart?.();

      // Load voice style if needed
      if (!this.currentStyle) {
        this.currentStyle = await this.loadVoiceStyle(voice);
      }

      // Chunk text
      const maxLen = lang === 'ko' ? 120 : 300;
      const textList = chunkText(text, maxLen);

      let wavCat: number[] = [];

      for (let i = 0; i < textList.length; i++) {
        // Check if stop was requested
        if (this._stopRequested) {
          console.log('[TTS] Stop requested, aborting speech');
          this._isSpeaking = false;
          return;
        }

        const { wav } = await this._infer(
          [textList[i]],
          [lang],
          this.currentStyle,
          totalStep,
          speed,
          (step) => onProgress?.(step + i * totalStep, textList.length * totalStep)
        );

        if (wavCat.length === 0) {
          wavCat = wav;
        } else {
          const silenceLen = Math.floor(silenceDuration * this._sampleRate);
          const silence = new Array(silenceLen).fill(0);
          wavCat = [...wavCat, ...silence, ...wav];
        }
      }

      // Check again before playing
      if (this._stopRequested) {
        console.log('[TTS] Stop requested before playback');
        this._isSpeaking = false;
        return;
      }

      // Play audio
      await this.playAudio(wavCat);
      this._isSpeaking = false;
      onEnd?.();

    } catch (error) {
      this._isSpeaking = false;
      onError?.(error as Error);
      throw error;
    }
  }

  private async _infer(
    textList: string[],
    langList: Language[],
    style: StyleTensors,
    totalStep: number,
    speed: number,
    progressCallback?: (step: number, total: number) => void
  ): Promise<{ wav: number[]; duration: number[] }> {
    if (!this.ort) throw new Error('ONNX Runtime not loaded');

    const bsz = textList.length;

    // Process text
    const { textIds, textMask } = this.textProcessor!.call(textList, langList);

    const textIdsFlat = new BigInt64Array(textIds.flat().map(x => BigInt(x)));
    const textIdsShape = [bsz, textIds[0].length];
    const textIdsTensor = new this.ort.Tensor('int64', textIdsFlat, textIdsShape);

    const textMaskFlat = new Float32Array(textMask.flat(2));
    const textMaskShape = [bsz, 1, textMask[0][0].length];
    const textMaskTensor = new this.ort.Tensor('float32', textMaskFlat, textMaskShape);

    // Duration prediction
    const dpOutputs = await this.dpSession!.run({
      text_ids: textIdsTensor,
      style_dp: style.dp,
      text_mask: textMaskTensor
    });
    const duration = Array.from(dpOutputs.duration.data as Float32Array).map(d => d / speed);

    // Text encoding
    const textEncOutputs = await this.textEncSession!.run({
      text_ids: textIdsTensor,
      style_ttl: style.ttl,
      text_mask: textMaskTensor
    });
    const textEmb = textEncOutputs.text_emb;

    // Sample noisy latent
    const { xt: initialXt, latentMask } = this.sampleNoisyLatent(
      duration,
      this._sampleRate,
      this.config!.ae.base_chunk_size,
      this.config!.ttl.chunk_compress_factor,
      this.config!.ttl.latent_dim
    );

    let xt = initialXt;

    const latentMaskFlat = new Float32Array(latentMask.flat(2));
    const latentMaskShape = [bsz, 1, latentMask[0][0].length];
    const latentMaskTensor = new this.ort.Tensor('float32', latentMaskFlat, latentMaskShape);

    const totalStepArray = new Float32Array(bsz).fill(totalStep);
    const totalStepTensor = new this.ort.Tensor('float32', totalStepArray, [bsz]);

    // Denoising loop
    for (let step = 0; step < totalStep; step++) {
      progressCallback?.(step + 1, totalStep);

      const currentStepArray = new Float32Array(bsz).fill(step);
      const currentStepTensor = new this.ort.Tensor('float32', currentStepArray, [bsz]);

      const xtFlat = new Float32Array(xt.flat(2));
      const xtShape = [bsz, xt[0].length, xt[0][0].length];
      const xtTensor = new this.ort.Tensor('float32', xtFlat, xtShape);

      const vectorEstOutputs = await this.vectorEstSession!.run({
        noisy_latent: xtTensor,
        text_emb: textEmb,
        style_ttl: style.ttl,
        latent_mask: latentMaskTensor,
        text_mask: textMaskTensor,
        current_step: currentStepTensor,
        total_step: totalStepTensor
      });

      const denoised = Array.from(vectorEstOutputs.denoised_latent.data as Float32Array);

      // Reshape to 3D
      const latentDim = xt[0].length;
      const latentLen = xt[0][0].length;
      xt = [];
      let idx = 0;
      for (let b = 0; b < bsz; b++) {
        const batch: number[][] = [];
        for (let d = 0; d < latentDim; d++) {
          const row: number[] = [];
          for (let t = 0; t < latentLen; t++) {
            row.push(denoised[idx++]);
          }
          batch.push(row);
        }
        xt.push(batch);
      }
    }

    // Vocoder
    const finalXtFlat = new Float32Array(xt.flat(2));
    const finalXtShape = [bsz, xt[0].length, xt[0][0].length];
    const finalXtTensor = new this.ort.Tensor('float32', finalXtFlat, finalXtShape);

    const vocoderOutputs = await this.vocoderSession!.run({
      latent: finalXtTensor
    });

    const wav = Array.from(vocoderOutputs.wav_tts.data as Float32Array);

    return { wav, duration };
  }

  private sampleNoisyLatent(
    duration: number[],
    sampleRate: number,
    baseChunkSize: number,
    chunkCompress: number,
    latentDim: number
  ): { xt: number[][][]; latentMask: number[][][] } {
    const bsz = duration.length;
    const maxDur = Math.max(...duration);

    const wavLenMax = Math.floor(maxDur * sampleRate);
    const wavLengths = duration.map(d => Math.floor(d * sampleRate));

    const chunkSize = baseChunkSize * chunkCompress;
    const latentLen = Math.floor((wavLenMax + chunkSize - 1) / chunkSize);
    const latentDimVal = latentDim * chunkCompress;

    const xt: number[][][] = [];
    for (let b = 0; b < bsz; b++) {
      const batch: number[][] = [];
      for (let d = 0; d < latentDimVal; d++) {
        const row: number[] = [];
        for (let t = 0; t < latentLen; t++) {
          // Box-Muller transform
          const u1 = Math.max(0.0001, Math.random());
          const u2 = Math.random();
          const val = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
          row.push(val);
        }
        batch.push(row);
      }
      xt.push(batch);
    }

    const latentLengths = wavLengths.map(len => Math.floor((len + chunkSize - 1) / chunkSize));
    const latentMask = this.lengthToMask(latentLengths, latentLen);

    // Apply mask
    for (let b = 0; b < bsz; b++) {
      for (let d = 0; d < latentDimVal; d++) {
        for (let t = 0; t < latentLen; t++) {
          xt[b][d][t] *= latentMask[b][0][t];
        }
      }
    }

    return { xt, latentMask };
  }

  private lengthToMask(lengths: number[], maxLen?: number): number[][][] {
    const actualMaxLen = maxLen || Math.max(...lengths);
    return lengths.map(len => {
      const row = new Array(actualMaxLen).fill(0.0);
      for (let j = 0; j < Math.min(len, actualMaxLen); j++) {
        row[j] = 1.0;
      }
      return [row];
    });
  }

  private async playAudio(audioData: number[]): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: this._sampleRate });
    }

    // Resume if suspended
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Create or update GainNode for volume control
    if (!this.gainNode) {
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }
    this.gainNode.gain.value = this._volume;

    // Create audio buffer
    const audioBuffer = this.audioContext.createBuffer(1, audioData.length, this._sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < audioData.length; i++) {
      channelData[i] = audioData[i];
    }

    // Play through GainNode
    return new Promise((resolve) => {
      this.currentSource = this.audioContext!.createBufferSource();
      this.currentSource.buffer = audioBuffer;
      this.currentSource.connect(this.gainNode!);
      this.currentSource.onended = () => {
        this.currentSource = null;
        resolve();
      };
      this.currentSource.start();
    });
  }

  stop(): void {
    this._stopRequested = true;
    this._isSpeaking = false;

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Ignore error if already stopped
      }
      this.currentSource = null;
    }
  }

  async dispose(): Promise<void> {
    this.stop();

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    // Release ONNX sessions
    await this.dpSession?.release();
    await this.textEncSession?.release();
    await this.vectorEstSession?.release();
    await this.vocoderSession?.release();

    this.dpSession = null;
    this.textEncSession = null;
    this.vectorEstSession = null;
    this.vocoderSession = null;
    this.textProcessor = null;
    this.config = null;
    this.currentStyle = null;
    this.ort = null;

    this._isLoaded = false;
    this._loadProgress = 0;
    this._isSpeaking = false;
    this._stopRequested = false;
  }
}

// Export WAV writer for potential use
export { writeWavFile };
