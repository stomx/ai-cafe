'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAIStore } from '@/store/aiStore';
import { SupertonicTTS, Language, getVoiceStylePath } from '@/lib/tts';

interface UseTextToSpeechOptions {
  language?: string;
  rate?: number; // 0.1 to 10, default 1
  pitch?: number; // 0 to 2, default 1
  volume?: number; // 0 to 1, default 1
  voice?: string; // Voice style path for Supertonic
  preferSupertonic?: boolean; // Whether to prefer Supertonic over Web Speech API
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
  onLoadProgress?: (progress: number, message: string) => void;
}

interface UseTextToSpeechReturn {
  isSpeaking: boolean;
  isLoading: boolean;
  isSupported: boolean;
  loadProgress: number;
  engineName: 'supertonic' | 'webspeech' | null;
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  loadSupertonic: () => Promise<boolean>;
  activateWebSpeech: () => void;
  error: string | null;
}

// Singleton instance of SupertonicTTS
let supertonicInstance: SupertonicTTS | null = null;
let supertonicLoadPromise: Promise<boolean> | null = null;

// 모바일 기기 감지 (ONNX 로딩 건너뛰기 용)
const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isMobile = window.innerWidth <= 768;
  const isPortraitScreen = window.innerHeight > window.innerWidth;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return isMobile || (isPortraitScreen && isTouchDevice);
};

export function useTextToSpeech(options: UseTextToSpeechOptions = {}): UseTextToSpeechReturn {
  const {
    language = 'ko-KR',
    rate = 1,
    pitch = 1,
    volume = 1,
    voice = getVoiceStylePath('F1.json'),
    preferSupertonic = true,
    onStart,
    onEnd,
    onError,
    onLoadProgress,
  } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [engineName, setEngineName] = useState<'supertonic' | 'webspeech' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const setModelStatus = useAIStore((state) => state.setModelStatus);

  // Store callbacks in refs
  const callbacksRef = useRef({ onStart, onEnd, onError, onLoadProgress });
  callbacksRef.current = { onStart, onEnd, onError, onLoadProgress };

  // iOS 사용자 인터랙션 활성화 플래그
  const isActivatedRef = useRef(false);

  // Web Speech API 활성화 (iOS에서 사용자 인터랙션 필요)
  const activateWebSpeech = useCallback(() => {
    if (isActivatedRef.current) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // iOS Safari에서 오디오 컨텍스트 활성화를 위한 빈 음성 재생
    const utterance = new SpeechSynthesisUtterance('');
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    isActivatedRef.current = true;
    console.log('[TTS] Web Speech API activated for iOS');
  }, []);

  // Find Korean voice for Web Speech API
  const findKoreanVoice = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;

    const voices = window.speechSynthesis.getVoices();

    // Prefer Korean voices
    const koreanVoice = voices.find(v =>
      v.lang.startsWith('ko') && v.localService
    ) || voices.find(v =>
      v.lang.startsWith('ko')
    );

    if (koreanVoice) {
      console.log('[TTS] Web Speech API voice:', koreanVoice.name, koreanVoice.lang);
      return koreanVoice;
    }

    // Fallback to any available voice
    console.log('[TTS] No Korean voice found, using default');
    return voices[0] || null;
  }, []);

  // Load Supertonic TTS engine
  const loadSupertonic = useCallback(async (): Promise<boolean> => {
    // 모바일에서는 ONNX 로딩 건너뛰기 (메모리 부족으로 크래시 방지)
    if (isMobileDevice()) {
      console.log('[TTS] 모바일 기기 감지 - Supertonic 로딩 건너뛰기, Web Speech API 사용');
      setEngineName('webspeech');
      setModelStatus('tts', 'fallback');
      return false;
    }

    // Return existing promise if already loading
    if (supertonicLoadPromise) {
      return supertonicLoadPromise;
    }

    // Return true if already loaded
    if (supertonicInstance?.isLoaded) {
      setEngineName('supertonic');
      setModelStatus('tts', 'ready');
      return true;
    }

    supertonicLoadPromise = (async () => {
      try {
        setIsLoading(true);
        setModelStatus('tts', 'loading');
        console.log('[TTS] Loading Supertonic TTS...');

        if (!supertonicInstance) {
          const cdnUrl = process.env.NEXT_PUBLIC_TTS_CDN_URL || '/tts/onnx';
          supertonicInstance = new SupertonicTTS(cdnUrl);
        }

        await supertonicInstance.load((progress, message) => {
          setLoadProgress(progress);
          callbacksRef.current.onLoadProgress?.(progress, message);
          console.log(`[TTS] ${message} (${progress}%)`);
        });

        setEngineName('supertonic');
        setModelStatus('tts', 'ready');
        console.log('[TTS] Supertonic TTS loaded successfully');
        return true;

      } catch (err) {
        console.error('[TTS] Failed to load Supertonic:', err);
        supertonicInstance = null;
        setModelStatus('tts', 'error');
        return false;
      } finally {
        setIsLoading(false);
        supertonicLoadPromise = null;
      }
    })();

    return supertonicLoadPromise;
  }, [setModelStatus]);

  // Initialize - prefer Web Speech API as immediate fallback
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const synth = window.speechSynthesis;
    const webSpeechSupported = !!synth;
    setIsSupported(webSpeechSupported);

    if (webSpeechSupported) {
      // Set fallback status immediately
      setModelStatus('tts', 'fallback');
      setEngineName('webspeech');

      // Voices might not be loaded immediately
      const loadVoices = () => {
        voiceRef.current = findKoreanVoice();
      };

      loadVoices();

      // Some browsers load voices asynchronously
      if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = loadVoices;
      }

      // Try to load Supertonic in background if preferred
      if (preferSupertonic) {
        // Delay loading to not block initial render
        const timer = setTimeout(() => {
          loadSupertonic();
        }, 1000);
        return () => clearTimeout(timer);
      }
    }

    return () => {
      if (synth) {
        synth.cancel();
      }
    };
  }, [setModelStatus, findKoreanVoice, preferSupertonic, loadSupertonic]);

  // Speak with Supertonic
  const speakWithSupertonic = useCallback(async (text: string) => {
    if (!supertonicInstance?.isLoaded) {
      throw new Error('Supertonic not loaded');
    }

    const lang = language.startsWith('ko') ? 'ko' :
                 language.startsWith('en') ? 'en' :
                 language.startsWith('es') ? 'es' :
                 language.startsWith('pt') ? 'pt' :
                 language.startsWith('fr') ? 'fr' : 'ko';

    await supertonicInstance.speak(text, lang as Language, {
      voice,
      speed: rate,
      volume: 1.5, // Supertonic 기본 음량 1.5배
      onStart: () => {
        console.log('[TTS] Supertonic speaking:', text.substring(0, 50) + '...');
        setIsSpeaking(true);
        setError(null);
        callbacksRef.current.onStart?.();
      },
      onEnd: () => {
        console.log('[TTS] Supertonic finished speaking');
        setIsSpeaking(false);
        callbacksRef.current.onEnd?.();
      },
      onError: (err) => {
        console.error('[TTS] Supertonic error:', err);
        const errorMessage = '음성 출력 중 오류가 발생했습니다.';
        setError(errorMessage);
        setIsSpeaking(false);
        callbacksRef.current.onError?.(errorMessage);
      },
    });
  }, [language, voice, rate]);

  // Speak with Web Speech API
  const speakWithWebSpeech = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      const err = '이 브라우저는 음성 합성을 지원하지 않습니다.';
      setError(err);
      callbacksRef.current.onError?.(err);
      return;
    }

    const synth = window.speechSynthesis;

    // Cancel any ongoing speech
    synth.cancel();

    // Clean text - remove emojis for cleaner speech
    // eslint-disable-next-line no-control-regex
    const cleanText = text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '').trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utteranceRef.current = utterance;

    // Set voice
    if (!voiceRef.current) {
      voiceRef.current = findKoreanVoice();
    }
    if (voiceRef.current) {
      utterance.voice = voiceRef.current;
    }

    // Set properties
    utterance.lang = language;
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = volume;

    // Event handlers
    utterance.onstart = () => {
      console.log('[TTS] Web Speech speaking:', cleanText.substring(0, 50) + '...');
      setIsSpeaking(true);
      setError(null);
      callbacksRef.current.onStart?.();
    };

    utterance.onend = () => {
      console.log('[TTS] Web Speech finished speaking');
      setIsSpeaking(false);
      utteranceRef.current = null;
      callbacksRef.current.onEnd?.();
    };

    utterance.onerror = (event) => {
      console.error('[TTS] Web Speech error:', event.error);

      // Ignore 'interrupted' errors (caused by cancel)
      if (event.error === 'interrupted') return;

      const errorMessage = '음성 출력 중 오류가 발생했습니다.';
      setError(errorMessage);
      setIsSpeaking(false);
      callbacksRef.current.onError?.(errorMessage);
    };

    // Speak
    synth.speak(utterance);
  }, [language, rate, pitch, volume, findKoreanVoice]);

  // Main speak function - tries Supertonic first, falls back to Web Speech
  const speak = useCallback((text: string) => {
    // Stop any current speech before starting new one
    if (supertonicInstance) {
      supertonicInstance.stop();
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    // If Supertonic is loaded and preferred, use it
    if (preferSupertonic && supertonicInstance?.isLoaded) {
      speakWithSupertonic(text).catch((err) => {
        console.warn('[TTS] Supertonic failed, falling back to Web Speech:', err);
        speakWithWebSpeech(text);
      });
    } else {
      // Use Web Speech API
      speakWithWebSpeech(text);
    }
  }, [preferSupertonic, speakWithSupertonic, speakWithWebSpeech]);

  const stop = useCallback(() => {
    // Stop Supertonic
    if (supertonicInstance) {
      supertonicInstance.stop();
    }

    // Stop Web Speech
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setIsSpeaking(false);
    utteranceRef.current = null;
  }, []);

  const pause = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Only Web Speech API supports pause
    window.speechSynthesis.pause();
  }, []);

  const resume = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    // Only Web Speech API supports resume
    window.speechSynthesis.resume();
  }, []);

  return {
    isSpeaking,
    isLoading,
    isSupported,
    loadProgress,
    engineName,
    speak,
    stop,
    pause,
    resume,
    loadSupertonic,
    activateWebSpeech,
    error,
  };
}
