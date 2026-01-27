'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { KioskLayout } from '@/components/layout';
import { MenuSection } from '@/components/menu';
import { OrderSection } from '@/components/order';
import { PreparingQueue, ReadyQueue } from '@/components/queue';
import { CameraPreview } from '@/components/camera';
import { ChatContainer } from '@/components/chat';
import { SplashScreen } from '@/components/splash';
import { useSpeechToText } from '@/hooks/useSpeechToText';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { useSessionTimer } from '@/hooks/useSessionTimer';
import { useVoiceOrderProcessor } from '@/hooks/useVoiceOrderProcessor';
import { useOrderStore } from '@/store/orderStore';
import { useQueueStore } from '@/store/queueStore';
import { useChatStore } from '@/store/chatStore';
import { onTTSStart, onTTSEnd, resetEchoFilter } from '@/utils/echoFilter';
import { playMicOnSound, playMicOffSound } from '@/utils/soundEffects';
import type { MenuItem } from '@/types/menu';

const VOICE_TIMEOUT = 30; // 음성 입력 종료 시점 (세션 잔여 시간 기준, 초)
const SESSION_WARNING = 10; // 세션 종료 임박 경고 (초)

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const [showTemperatureModal, setShowTemperatureModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [pendingOrders, setPendingOrders] = useState<{ menuItem: MenuItem; quantity: number }[]>([]);

  // 얼굴 인식 On/Off (기본값 false, 스플래시 화면에서 설정)
  const [faceDetectionEnabled, setFaceDetectionEnabled] = useState(false);

  const hasAutoStartedRef = useRef(false);
  const speakRef = useRef<(text: string) => void>(() => {});
  const hasShownMicTimeoutRef = useRef(false);
  const hasShownSessionWarningRef = useRef(false);

  const addItem = useOrderStore((state) => state.addItem);
  const items = useOrderStore((state) => state.items);
  const clearOrder = useOrderStore((state) => state.clearOrder);
  const addToQueue = useQueueStore((state) => state.addToQueue);
  const startSimulation = useQueueStore((state) => state.startSimulation);

  // Chat store
  const addGreeting = useChatStore((state) => state.addGreeting);
  const addAssistantResponse = useChatStore((state) => state.addAssistantResponse);
  const clearMessages = useChatStore((state) => state.clearMessages);

  // Session timeout handler - 세션 타임아웃 시 호출, 스플래시 화면으로 복귀
  // resetVoiceProcessorRef를 사용하여 stale closure 방지
  const resetVoiceProcessorRef = useRef<() => void>(() => {});

  const handleSessionTimeout = useCallback(() => {
    console.log('[Page] Session timeout - returning to splash');
    setShowTemperatureModal(false);
    setSelectedItem(null);
    setPendingOrders([]);
    clearOrder();
    clearMessages();
    resetEchoFilter();
    resetVoiceProcessorRef.current(); // 음성 처리 상태 초기화
    hasAutoStartedRef.current = false;
    hasShownMicTimeoutRef.current = false;
    hasShownSessionWarningRef.current = false;
    // 스플래시 화면으로 복귀
    setShowSplash(true);
  }, [clearOrder, clearMessages]);

  // Session timer hook
  const {
    isActive: isSessionActive,
    timeLeft: sessionTimeLeft,
    startSession,
    stopSession,
    resetActivity,
    SESSION_TIMEOUT,
  } = useSessionTimer(handleSessionTimeout);

  // Voice order processor hook
  const {
    voiceState,
    setVoiceState,
    temperatureConflicts,
    handleSpeechResult,
    handleVoiceTemperatureSelect,
    interimMessageIdRef,
    resetState: resetVoiceProcessor,
  } = useVoiceOrderProcessor({
    speakRef,
    resetActivity,
  });

  // Keep resetVoiceProcessorRef updated for use in handleSessionTimeout
  resetVoiceProcessorRef.current = resetVoiceProcessor;

  // 얼굴 인식 토글
  const toggleFaceDetection = useCallback(() => {
    setFaceDetectionEnabled(prev => !prev);
  }, []);

  const handleSilenceTimeout = useCallback(() => {
    if (interimMessageIdRef.current) {
      const removeMessage = useChatStore.getState().removeMessage;
      removeMessage(interimMessageIdRef.current);
      interimMessageIdRef.current = null;
    }
    // timeout 상태로 설정 (다시 시도 버튼 표시)
    setVoiceState('timeout');
    const msg = '15초간 음성이 없어서 마이크를 껐어요. 버튼을 눌러 다시 주문해주세요.';
    addAssistantResponse(msg);
    speakRef.current(msg);
    // 음성 타임아웃 시에도 활동으로 간주하지 않음 - 세션 타이머는 계속 진행
  }, [addAssistantResponse, setVoiceState, interimMessageIdRef]);

  const handleSpeechStart = useCallback(() => {
    // voiceState는 sttState에서 동기화되므로 여기서 설정 불필요
    // 주의: 여기서 resetActivity를 호출하면 TTS 에코가 마이크에 잡힐 때도 타이머가 리셋됨
    // 대신 handleSpeechResult에서 에코 필터 후 resetActivity 호출
  }, []);

  const {
    isListening,
    isSupported: isSttSupported,
    startListening,
    stopListening,
    state: sttState,
  } = useSpeechToText({
    language: 'ko-KR',
    continuous: true,
    silenceTimeout: 15000,
    onResult: handleSpeechResult,
    onSilenceTimeout: handleSilenceTimeout,
    onSpeechStart: handleSpeechStart,
  });

  // STT 상태 변화에 따라 voiceState 동기화
  // voiceState: UI 힌트용 (idle, listening, timeout, success)
  // sttState: 실제 음성인식 상태 (idle, starting, listening, stopping)
  const prevSttStateRef = useRef(sttState);
  useEffect(() => {
    const prevState = prevSttStateRef.current;
    prevSttStateRef.current = sttState;

    if (sttState === 'listening') {
      setVoiceState('listening');
    } else if (sttState === 'idle' && prevState !== 'idle') {
      // STT가 종료됨 - voiceState도 idle로 (timeout/success는 이미 콜백에서 설정됨)
      setVoiceState(prev => prev === 'listening' ? 'idle' : prev);
    }
  }, [sttState, setVoiceState]);

  // Text-to-Speech with echo filter callbacks
  const { speak } = useTextToSpeech({
    language: 'ko-KR',
    rate: 1.1,
    onEnd: onTTSEnd, // 에코 필터에 TTS 종료 알림
  });

  // TTS 래퍼 - 에코 필터에 텍스트 전달
  const speakWithEchoFilter = useCallback((text: string) => {
    onTTSStart(text);
    speak(text);
  }, [speak]);

  // Keep speakRef updated for use in callbacks
  speakRef.current = speakWithEchoFilter;

  // Callback for when splash screen is dismissed
  const handleSplashStart = useCallback((cameraEnabled: boolean) => {
    // 스플래시에서 시작 시 경고 플래그 초기화
    hasShownMicTimeoutRef.current = false;
    hasShownSessionWarningRef.current = false;

    // 카메라(얼굴 인식) 활성화 설정
    setFaceDetectionEnabled(cameraEnabled);
    setShowSplash(false);

    // 세션 시작 및 인사 메시지
    startSession();
    addGreeting();

    // TTS 재생 (약간의 딜레이 후 - 화면 전환 완료 대기)
    setTimeout(() => {
      speakRef.current('안녕하세요! 무엇을 주문하시겠어요?');
    }, 300);

    // 마이크는 자동 시작하지 않음
    // 마이크 실행 조건:
    // 1. 카메라가 켜져있고 얼굴이 감지될 때 (handleFaceDetected)
    // 2. 사용자가 "음성으로 주문하기" 버튼을 눌렀을 때 (handleStartOrder)
  }, [startSession, addGreeting]);

  // Start queue simulation on mount (only after splash is dismissed)
  useEffect(() => {
    if (!showSplash) {
      startSimulation();
    }
  }, [showSplash, startSimulation]);

  // Reset auto-start flag when STT state becomes idle
  useEffect(() => {
    if (sttState === 'idle') {
      hasAutoStartedRef.current = false;
    }
  }, [sttState]);

  // 15초 이하가 되면 음성 입력 대기 종료 + 알림 메시지
  // 30초~16초: 음성 입력 대기 유지, 15초 이하: 음성 입력 끔
  useEffect(() => {
    if (isSessionActive && sessionTimeLeft <= VOICE_TIMEOUT && isListening) {
      console.log(`[Page] Session time ${sessionTimeLeft}s <= ${VOICE_TIMEOUT}s, stopping voice input`);
      stopListening();

      // 한 번만 알림
      if (!hasShownMicTimeoutRef.current) {
        hasShownMicTimeoutRef.current = true;
        const msg = '장시간 말씀이 없으셔서 마이크를 껐어요. 터치로 이어서 진행해주세요.';
        addAssistantResponse(msg);
        speakRef.current(msg);
      }
    }
  }, [isSessionActive, sessionTimeLeft, isListening, stopListening, addAssistantResponse]);

  // 10초 남으면 세션 종료 임박 경고
  useEffect(() => {
    if (isSessionActive && sessionTimeLeft === SESSION_WARNING && !hasShownSessionWarningRef.current) {
      hasShownSessionWarningRef.current = true;
      const msg = '곧 세션이 종료됩니다. 계속하시려면 화면을 터치해주세요.';
      console.log(`[Page] Session warning at ${sessionTimeLeft}s`);
      addAssistantResponse(msg);
      speakRef.current(msg);
    }
  }, [isSessionActive, sessionTimeLeft, addAssistantResponse]);

  const handleSelectMenuItem = useCallback((item: MenuItem) => {
    resetActivity(); // 활동 타이머 리셋
    // 사용자 터치 시 음성 입력 비활성화 (안내 없음)
    if (isListening) {
      stopListening();
    }
    // 사용자 활동 시 경고 플래그 초기화
    hasShownMicTimeoutRef.current = false;
    hasShownSessionWarningRef.current = false;
    setPendingOrders([]);

    if (item.temperatures.length > 1) {
      setSelectedItem(item);
      setShowTemperatureModal(true);
    } else if (item.temperatures.length === 1) {
      addItem(item, item.temperatures[0]);
    } else {
      addItem(item, null);
    }
  }, [addItem, resetActivity, isListening, stopListening]);

  const handleSelectTemperature = useCallback((temp: 'HOT' | 'ICE') => {
    resetActivity(); // 활동 타이머 리셋
    // 사용자 터치 시 음성 입력 비활성화 (안내 없음)
    if (isListening) {
      stopListening();
    }
    // 사용자 활동 시 경고 플래그 초기화
    hasShownMicTimeoutRef.current = false;
    hasShownSessionWarningRef.current = false;

    if (selectedItem) {
      const pendingOrder = pendingOrders.find(o => o.menuItem.id === selectedItem.id);
      const quantity = pendingOrder?.quantity ?? 1;

      for (let i = 0; i < quantity; i++) {
        addItem(selectedItem, temp);
      }

      const remainingOrders = pendingOrders.filter(o => o.menuItem.id !== selectedItem.id);
      setPendingOrders(remainingOrders);

      if (remainingOrders.length > 0) {
        setSelectedItem(remainingOrders[0].menuItem);
      } else {
        setSelectedItem(null);
        setShowTemperatureModal(false);
      }
    }
  }, [selectedItem, addItem, pendingOrders, resetActivity, isListening, stopListening]);

  const handleConfirmOrder = useCallback(() => {
    if (items.length === 0) return;

    // 세션 타이머 정지
    stopSession();

    // quantity 고려하여 아이템 목록 생성
    const itemNames = items.flatMap((item) => {
      const name = item.temperature ? `${item.name}(${item.temperature})` : item.name;
      return Array(item.quantity).fill(name);
    });
    addToQueue(itemNames);
    clearOrder();
    clearMessages();
    setVoiceState('idle');

    setTimeout(() => {
      const msg = '주문이 완료되었습니다! 잠시만 기다려주세요.';
      addAssistantResponse(msg);
      speakRef.current(msg);
    }, 500);
  }, [items, addToQueue, clearOrder, clearMessages, addAssistantResponse, stopSession, setVoiceState]);

  const handleFaceDetected = useCallback(() => {
    // 아직 자동 시작하지 않은 경우에만
    if (isSttSupported && !hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true;
      // 새 세션 시작 시 경고 플래그 초기화
      hasShownMicTimeoutRef.current = false;
      hasShownSessionWarningRef.current = false;

      // 세션 타이머 시작
      startSession();

      // 인사 메시지 추가 및 TTS
      addGreeting();
      speakRef.current('안녕하세요! 무엇을 주문하시겠어요?');

      // 2초 후 음성 인식 시작
      setTimeout(() => {
        playMicOnSound(); // 마이크 켜짐 효과음
        startListening();
      }, 2000);
    }
  }, [isSttSupported, startSession, addGreeting, startListening]);

  const handleStartOrder = useCallback(() => {
    console.log('[Page] handleStartOrder called');
    interimMessageIdRef.current = null;
    // 사용자 활동 시 경고 플래그 초기화 (다시 경고 가능하도록)
    hasShownMicTimeoutRef.current = false;
    hasShownSessionWarningRef.current = false;
    // 먼저 타이머 리셋 (30초) → 그 다음 음성 입력 시작
    // 순서 중요: startListening 전에 resetActivity를 호출해야 15초 이하 체크에서 안전
    resetActivity();
    playMicOnSound(); // 마이크 켜짐 효과음
    startListening();
  }, [startListening, resetActivity, interimMessageIdRef]);

  const handleStopListening = useCallback(() => {
    console.log('[Page] handleStopListening called');
    if (interimMessageIdRef.current) {
      const removeMessage = useChatStore.getState().removeMessage;
      removeMessage(interimMessageIdRef.current);
      interimMessageIdRef.current = null;
    }
    playMicOffSound(); // 마이크 꺼짐 효과음
    stopListening();
  }, [stopListening, interimMessageIdRef]);

  // Show splash screen (includes loading)
  if (showSplash) {
    return <SplashScreen onStart={handleSplashStart} />;
  }

  return (
    <>
      <KioskLayout
        menuSection={
          <MenuSection onSelectItem={handleSelectMenuItem} />
        }
        orderSection={
          <OrderSection
            onConfirmOrder={handleConfirmOrder}
            voiceState={voiceState}
            isListening={isListening}
            onStartListening={handleStartOrder}
            onStopListening={handleStopListening}
          />
        }
        preparingQueue={<PreparingQueue />}
        readyQueue={<ReadyQueue />}
        chatSection={<ChatContainer />}
        cameraPreview={
          <CameraPreview
            onFaceDetected={handleFaceDetected}
            showPreview={true}
            autoStart={true}
            enabled={faceDetectionEnabled}
            size="small"
          />
        }
        faceDetectionEnabled={faceDetectionEnabled}
        onToggleFaceDetection={toggleFaceDetection}
        onScreenTouch={() => {
          if (isSessionActive) {
            resetActivity();
            // 경고 플래그 초기화
            hasShownMicTimeoutRef.current = false;
            hasShownSessionWarningRef.current = false;
          }
        }}
        sessionTimer={
          isSessionActive && (
            <div className={`session-timer ${sessionTimeLeft <= 10 ? 'critical' : sessionTimeLeft <= 15 ? 'warning' : ''}`}>
              <div className="session-timer-content">
                <div className="session-timer-bar">
                  <div
                    className="session-timer-progress"
                    style={{ width: `${(sessionTimeLeft / SESSION_TIMEOUT) * 100}%` }}
                  />
                </div>
                <span className="session-timer-text">
                  {isListening
                    ? `음성 대기 ${sessionTimeLeft}초`
                    : `세션 종료까지 ${sessionTimeLeft}초`}
                </span>
              </div>
            </div>
          )
        }
      />

      {/* 터치 선택용 온도 모달 */}
      {showTemperatureModal && selectedItem && (
        <div
          className="modal-overlay"
          onClick={() => setShowTemperatureModal(false)}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">{selectedItem.name}</h3>
            <p className="modal-subtitle">온도를 선택해주세요</p>
            <div className="modal-buttons">
              {selectedItem.temperatures.includes('HOT') && (
                <button
                  className="temp-select-btn temp-select-hot"
                  onClick={() => handleSelectTemperature('HOT')}
                >
                  <span className="text-2xl">🔥</span>
                  <span>HOT</span>
                </button>
              )}
              {selectedItem.temperatures.includes('ICE') && (
                <button
                  className="temp-select-btn temp-select-ice"
                  onClick={() => handleSelectTemperature('ICE')}
                >
                  <span className="text-2xl">🧊</span>
                  <span>ICE</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 음성 주문 시 온도 선택 UI */}
      {temperatureConflicts.length > 0 && !showTemperatureModal && (
        <div className="voice-temp-select">
          <div className="voice-temp-content">
            <p className="voice-temp-title">
              {temperatureConflicts[0].menuItem.name}
            </p>
            <p className="voice-temp-subtitle">
              온도를 선택해주세요
            </p>
            <p className="voice-temp-hint">
              &quot;따뜻하게&quot; 또는 &quot;차갑게&quot;라고 말씀하시거나 버튼을 눌러주세요
            </p>
            <div className="voice-temp-buttons">
              {temperatureConflicts[0].menuItem.temperatures.includes('HOT') && (
                <button
                  className="voice-temp-btn voice-temp-hot"
                  onClick={() => handleVoiceTemperatureSelect('HOT')}
                >
                  <span>🔥</span>
                  <span>HOT</span>
                </button>
              )}
              {temperatureConflicts[0].menuItem.temperatures.includes('ICE') && (
                <button
                  className="voice-temp-btn voice-temp-ice"
                  onClick={() => handleVoiceTemperatureSelect('ICE')}
                >
                  <span>🧊</span>
                  <span>ICE</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
