'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAIStore } from '@/store/aiStore';

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onaudioend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onnomatch: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface UseSpeechToTextOptions {
  language?: string;
  continuous?: boolean;
  silenceTimeout?: number;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onSilenceTimeout?: () => void;
  onSpeechStart?: () => void;
}

/**
 * STT 상태 머신
 * idle -> starting -> listening -> stopping -> idle
 */
type SttState = 'idle' | 'starting' | 'listening' | 'stopping';

interface UseSpeechToTextReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  interimTranscript: string;
  hasReceivedSpeech: boolean;
  startListening: () => void;
  stopListening: () => void;
  error: string | null;
  state: SttState;
}

const getSpeechRecognitionAPI = () => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextReturn {
  const {
    language = 'ko-KR',
    continuous = false,
    silenceTimeout = 0,
    onResult,
    onError,
    onSilenceTimeout,
    onSpeechStart,
  } = options;

  const [state, setState] = useState<SttState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [hasReceivedSpeech, setHasReceivedSpeech] = useState(false);

  // Refs for mutable values
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasReceivedSpeechRef = useRef(false);
  const pendingStartRef = useRef(false);

  // ✅ State를 ref로도 관리 (setTimeout 내부에서 최신 값 접근용)
  const stateRef = useRef<SttState>('idle');
  stateRef.current = state;

  const setModelStatus = useAIStore((state) => state.setModelStatus);

  // Store callbacks in refs
  const callbacksRef = useRef({ onResult, onError, onSilenceTimeout, onSpeechStart });
  callbacksRef.current = { onResult, onError, onSilenceTimeout, onSpeechStart };

  const optionsRef = useRef({ language, continuous, silenceTimeout });
  optionsRef.current = { language, continuous, silenceTimeout };

  // Check support on mount
  useEffect(() => {
    const SpeechRecognitionAPI = getSpeechRecognitionAPI();
    const supported = !!SpeechRecognitionAPI;
    setIsSupported(supported);

    if (supported) {
      setModelStatus('stt', 'fallback');
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    };
  }, [setModelStatus]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ✅ startSilenceTimer - stateRef.current 사용으로 최신 상태 접근
  const startSilenceTimer = useCallback(() => {
    const timeout = optionsRef.current.silenceTimeout;
    if (timeout <= 0) return;

    clearSilenceTimer();
    silenceTimerRef.current = setTimeout(() => {
      // ✅ stateRef.current로 최신 상태 확인
      if (!hasReceivedSpeechRef.current && stateRef.current === 'listening') {
        console.log('[STT] Silence timeout - no speech detected');
        callbacksRef.current.onSilenceTimeout?.();

        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch {
            // Ignore
          }
        }
      }
    }, timeout);
  }, [clearSilenceTimer]);

  // ✅ doStart를 ref로 저장하여 onend에서 최신 버전 호출
  const doStartRef = useRef<() => void>(() => {});

  const doStart = useCallback(() => {
    const SpeechRecognitionAPI = getSpeechRecognitionAPI();

    if (!SpeechRecognitionAPI) {
      const err = '이 브라우저는 음성 인식을 지원하지 않습니다.';
      setError(err);
      callbacksRef.current.onError?.(err);
      setState('idle');
      return;
    }

    // Reset state
    setError(null);
    setTranscript('');
    setInterimTranscript('');
    setHasReceivedSpeech(false);
    hasReceivedSpeechRef.current = false;

    const recognition = new SpeechRecognitionAPI();
    recognitionRef.current = recognition;

    const opts = optionsRef.current;
    recognition.continuous = opts.continuous;
    recognition.interimResults = true;
    recognition.lang = opts.language;

    recognition.onstart = () => {
      console.log('[STT] Recognition started');
      setState('listening');
      startSilenceTimer();
    };

    recognition.onaudiostart = () => {
      console.log('[STT] Audio capture started');
    };

    recognition.onaudioend = () => {
      console.log('[STT] Audio capture ended');
    };

    recognition.onspeechstart = () => {
      console.log('[STT] Speech detected');
      if (!hasReceivedSpeechRef.current) {
        hasReceivedSpeechRef.current = true;
        setHasReceivedSpeech(true);
        clearSilenceTimer();
        callbacksRef.current.onSpeechStart?.();
      }
    };

    recognition.onspeechend = () => {
      console.log('[STT] Speech ended');
    };

    recognition.onnomatch = () => {
      console.log('[STT] No match');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      console.log('[STT] onresult called, resultIndex:', event.resultIndex, 'results.length:', event.results.length);

      let finalTranscript = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';
        const confidence = result[0]?.confidence;

        console.log('[STT] Result[', i, ']:', text, 'isFinal:', result.isFinal, 'confidence:', confidence);

        if (result.isFinal) {
          if (text.trim() && (confidence === undefined || confidence > 0.3)) {
            finalTranscript += text;
            console.log('[STT] Final accepted:', text);
          } else {
            console.log('[STT] Final rejected - empty or low confidence');
          }
        } else {
          currentInterim += text;
        }
      }

      if (finalTranscript) {
        console.log('[STT] Calling onResult with final:', finalTranscript);
        setTranscript(prev => prev + finalTranscript);
        callbacksRef.current.onResult?.(finalTranscript, true);

        if (optionsRef.current.continuous) {
          console.log('[STT] Resetting silence timer after final result');
          hasReceivedSpeechRef.current = false;
          startSilenceTimer();
        }
      }

      setInterimTranscript(currentInterim);
      if (currentInterim) {
        console.log('[STT] Calling onResult with interim:', currentInterim);
        callbacksRef.current.onResult?.(currentInterim, false);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.log('[STT] Error:', event.error, event.message);

      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }

      let errorMessage = '음성 인식 오류가 발생했습니다.';

      switch (event.error) {
        case 'not-allowed':
          errorMessage = '마이크 사용 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.';
          break;
        case 'audio-capture':
          errorMessage = '마이크를 찾을 수 없습니다. 시스템 설정에서 마이크를 확인해주세요.';
          break;
        case 'network':
          errorMessage = '네트워크 오류가 발생했습니다. 인터넷 연결을 확인해주세요.';
          break;
        case 'service-not-allowed':
          errorMessage = '음성 인식 서비스를 사용할 수 없습니다.';
          break;
      }

      setError(errorMessage);
      callbacksRef.current.onError?.(errorMessage);
    };

    recognition.onend = () => {
      console.log('[STT] Recognition ended (onend), pending start:', pendingStartRef.current, 'stateRef:', stateRef.current);

      recognitionRef.current = null;
      clearSilenceTimer();

      if (pendingStartRef.current) {
        pendingStartRef.current = false;
        setState('starting');
        // ✅ doStartRef.current()로 최신 doStart 호출
        setTimeout(() => {
          doStartRef.current();
        }, 100);
      } else {
        setState('idle');
      }
    };

    try {
      recognition.start();
      console.log('[STT] Recognition start called');
    } catch (err) {
      console.error('[STT] Failed to start:', err);
      const errorMessage = '음성 인식을 시작할 수 없습니다.';
      setError(errorMessage);
      callbacksRef.current.onError?.(errorMessage);
      recognitionRef.current = null;
      setState('idle');
    }
  }, [clearSilenceTimer, startSilenceTimer]);

  // ✅ doStart가 변경될 때마다 ref 업데이트
  doStartRef.current = doStart;

  const startListening = useCallback(() => {
    console.log('[STT] startListening called, current state:', stateRef.current);

    // ✅ stateRef.current로 최신 상태 확인
    if (stateRef.current === 'idle') {
      setState('starting');
      doStart();
    } else if (stateRef.current === 'stopping') {
      console.log('[STT] Currently stopping, will restart after');
      pendingStartRef.current = true;
    } else {
      console.log('[STT] Cannot start in state:', stateRef.current);
    }
  }, [doStart]);

  const stopListening = useCallback(() => {
    console.log('[STT] stopListening called, current state:', stateRef.current);

    // ✅ stateRef.current로 최신 상태 확인
    if (stateRef.current === 'listening' || stateRef.current === 'starting') {
      setState('stopping');
      clearSilenceTimer();
      pendingStartRef.current = false;

      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore
        }
      } else {
        setState('idle');
      }
    } else {
      console.log('[STT] Cannot stop in state:', stateRef.current);
    }
  }, [clearSilenceTimer]);

  return {
    isListening: state === 'listening',
    isSupported,
    transcript,
    interimTranscript,
    hasReceivedSpeech,
    startListening,
    stopListening,
    error,
    state,
  };
}
