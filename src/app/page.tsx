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
import { useQueueStore, setOnReadyCallback } from '@/store/queueStore';
import { useChatStore } from '@/store/chatStore';
import { onTTSStart, onTTSEnd, resetEchoFilter } from '@/utils/echoFilter';
import { playMicOnSound, playMicOffSound } from '@/utils/soundEffects';
import type { MenuItem } from '@/types/menu';

const SESSION_WARNING = 10; // 세션 종료 임박 경고 (초)

// 숫자를 한글 자릿수로 변환 (1001 → "일공공일")
const numberToKoreanDigits = (num: number): string => {
  const digits = ['공', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  return String(num).split('').map(d => digits[parseInt(d)]).join('');
};

// 금액을 한글로 변환 (18500 → "만 팔천 오백")
const numberToKoreanPrice = (num: number): string => {
  if (num === 0) return '영';

  const units = ['', '만', '억'];
  const smallUnits = ['', '십', '백', '천'];
  const digits = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];

  const parts: string[] = [];
  let unitIndex = 0;

  while (num > 0) {
    const chunk = num % 10000;
    if (chunk > 0) {
      const chunkParts: string[] = [];
      let tempChunk = chunk;

      for (let i = 0; i < 4 && tempChunk > 0; i++) {
        const digit = tempChunk % 10;
        if (digit > 0) {
          // 1인 경우 십, 백, 천 앞에서는 생략
          const digitStr = (digit === 1 && i > 0) ? '' : digits[digit];
          chunkParts.unshift(digitStr + smallUnits[i]);
        }
        tempChunk = Math.floor(tempChunk / 10);
      }

      // 만, 억 단위 추가
      if (unitIndex > 0) {
        // 만 앞의 '일' 생략 (일만 → 만)
        if (chunkParts.length === 1 && chunkParts[0] === '일') {
          parts.unshift(units[unitIndex]);
        } else {
          parts.unshift(chunkParts.join(' ') + ' ' + units[unitIndex]);
        }
      } else {
        parts.unshift(chunkParts.join(' '));
      }
    }

    num = Math.floor(num / 10000);
    unitIndex++;
  }

  return parts.join(' ');
};

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const [showTemperatureModal, setShowTemperatureModal] = useState(false);
  const [showOrderConfirmModal, setShowOrderConfirmModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [pendingOrders, setPendingOrders] = useState<{ menuItem: MenuItem; quantity: number }[]>([]);

  // 얼굴 인식 On/Off (기본값 false, 스플래시 화면에서 설정)
  const [faceDetectionEnabled, setFaceDetectionEnabled] = useState(false);

  const hasAutoStartedRef = useRef(false);
  const speakRef = useRef<(text: string) => void>(() => {});
  const stopTTSRef = useRef<() => void>(() => {});
  const hasShownMicTimeoutRef = useRef(false);
  const hasShownSessionWarningRef = useRef(false);
  const prevItemsRef = useRef<typeof items>([]);
  const isOrderConfirmingRef = useRef(false); // 주문 확정 중 플래그 (삭제 알림 방지)

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

    // 중복 알림 방지
    if (!hasShownMicTimeoutRef.current) {
      hasShownMicTimeoutRef.current = true;
      const msg = '음성 입력이 없어서 마이크를 껐습니다. 음성으로 주문하기를 누른 후 음성으로 주문하거나 버튼을 눌러 주문해주세요.';
      addAssistantResponse(msg);
      speakRef.current(msg);
    }
    // 음성 타임아웃 시에도 활동으로 간주하지 않음 - 세션 타이머는 계속 진행
  }, [addAssistantResponse, setVoiceState, interimMessageIdRef]);

  const handleSpeechStart = useCallback(() => {
    // 음성 입력 시작 시 TTS 중지
    stopTTSRef.current();
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

  // Text-to-Speech with echo filter callbacks (기본 음성 F1)
  const { speak, stop: stopTTS } = useTextToSpeech({
    language: 'ko-KR',
    rate: 1.2,
    voice: '/tts/voice_styles/F1.json',
    onEnd: onTTSEnd, // 에코 필터에 TTS 종료 알림
  });

  // 픽업 안내용 TTS (F2 음성)
  const { speak: speakPickup } = useTextToSpeech({
    language: 'ko-KR',
    rate: 1.2,
    voice: '/tts/voice_styles/F1.json',
  });

  // Keep stopTTSRef updated
  stopTTSRef.current = stopTTS;

  // 픽업 대기 안내 콜백 설정
  useEffect(() => {
    setOnReadyCallback((orderNumber: number) => {
      const orderNumKr = numberToKoreanDigits(orderNumber);
      speakPickup(`${orderNumKr}번 주문이 준비되었습니다. 픽업대에서 찾아가 주세요.`);
    });

    return () => {
      setOnReadyCallback(null);
    };
  }, [speakPickup, addAssistantResponse]);

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

  // 메뉴 변경 감지 및 TTS 재생 (디바운스 적용)
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastNotifiedItemsRef = useRef<string>('');

  useEffect(() => {
    const prevItems = prevItemsRef.current;
    prevItemsRef.current = items;

    // 스플래시 화면이면 무시
    if (showSplash) return;

    // 음성 주문 처리 중이면 무시 (useVoiceOrderProcessor에서 직접 응답함)
    if (temperatureConflicts.length > 0 || voiceState === 'listening' || voiceState === 'success') return;

    // 첫 렌더링이면 무시
    if (prevItems.length === 0 && items.length === 0) return;

    // 변경 유형 감지
    let changeType: 'add' | 'remove' | 'update' | null = null;
    let changedItem: typeof items[0] | null = null;

    // 아이템 추가 감지
    if (items.length > prevItems.length) {
      changeType = 'add';
      changedItem = items[items.length - 1];
    }
    // 아이템 삭제 감지 (주문 확정 중에는 무시)
    else if (items.length < prevItems.length) {
      // 주문 확정으로 인한 삭제는 알림 안 함
      if (isOrderConfirmingRef.current) {
        isOrderConfirmingRef.current = false;
        return;
      }
      changeType = 'remove';
      const removedItem = prevItems.find(prev => !items.some(curr => curr.id === prev.id));
      if (removedItem) {
        changedItem = removedItem;
      }
    }
    // 수량 변경 감지
    else if (items.length === prevItems.length && items.length > 0) {
      for (const curr of items) {
        const prev = prevItems.find(p => p.id === curr.id);
        if (prev && curr.quantity !== prev.quantity) {
          changeType = 'update';
          changedItem = curr;
          break;
        }
      }
    }

    if (!changeType || !changedItem) return;

    // 추가/삭제는 즉시 알림
    if (changeType === 'add' || changeType === 'remove') {
      const tempStr = changedItem.temperature ? ` ${changedItem.temperature}` : '';
      const msg = changeType === 'add'
        ? `${changedItem.name}${tempStr} ${changedItem.quantity}잔 추가했습니다.`
        : `${changedItem.name} 삭제했습니다.`;
      addAssistantResponse(msg);
      speakRef.current(msg);
      return;
    }

    // 수량 변경은 디바운스 적용
    if (changeType === 'update') {
      // 기존 타이머 취소
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // 현재 상태를 스냅샷으로 저장
      const itemSnapshot = { ...changedItem };

      // 디바운스: 600ms 후 메시지 표시
      debounceTimerRef.current = setTimeout(() => {
        const tempStr = itemSnapshot.temperature ? ` ${itemSnapshot.temperature}` : '';
        const msg = `${itemSnapshot.name}${tempStr} ${itemSnapshot.quantity}잔으로 변경했습니다.`;

        // 중복 알림 방지
        const msgKey = `${itemSnapshot.id}-${itemSnapshot.quantity}`;
        if (lastNotifiedItemsRef.current !== msgKey) {
          lastNotifiedItemsRef.current = msgKey;
          addAssistantResponse(msg);
          speakRef.current(msg);
        }

        debounceTimerRef.current = null;
      }, 600);
    }
  }, [items, showSplash, addAssistantResponse, temperatureConflicts, voiceState]);

  const handleSelectMenuItem = useCallback((item: MenuItem) => {
    stopTTSRef.current(); // TTS 중지
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
    stopTTSRef.current(); // TTS 중지
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

  // 주문확인 버튼 클릭 → 다이얼로그 표시 + TTS 안내
  const handleShowOrderConfirm = useCallback(() => {
    if (items.length === 0) return;

    stopTTSRef.current(); // TTS 중지
    resetActivity(); // 세션 타이머 리셋
    setShowOrderConfirmModal(true);

    // TTS로 주문 내역 안내 (TTS 중지 후 약간의 딜레이)
    setTimeout(() => {
      const total = items.reduce((sum, item) => sum + item.totalPrice, 0);
      const itemList = items.map(item => {
        const tempStr = item.temperature ? ` ${item.temperature}` : '';
        return `${item.name}${tempStr} ${item.quantity}잔`;
      }).join(', ');
      const msg = `${itemList}. 총 ${numberToKoreanPrice(total)}원입니다. 결제하시겠어요?`;
      addAssistantResponse(msg);
      speakRef.current(msg);
    }, 100);
  }, [items, resetActivity, addAssistantResponse]);

  // 다이얼로그에서 최종 확인 → 실제 주문 처리
  const handleConfirmOrder = useCallback(() => {
    if (items.length === 0) return;

    stopTTSRef.current(); // TTS 중지
    setShowOrderConfirmModal(false);
    isOrderConfirmingRef.current = true; // 주문 확정 중 플래그 (삭제 알림 방지)
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
      speakRef.current('주문이 완료되었습니다! 잠시만 기다려주세요.');
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
    stopTTSRef.current(); // TTS 중지
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
            onConfirmOrder={handleShowOrderConfirm}
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
            stopTTSRef.current(); // TTS 중지
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

      {/* 주문확인 모달 */}
      {showOrderConfirmModal && items.length > 0 && (
        <div
          className="modal-overlay"
          onClick={() => {
            stopTTSRef.current();
            setShowOrderConfirmModal(false);
          }}
        >
          <div
            className="modal-content order-confirm-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="modal-title">주문 확인</h3>
            <div className="order-confirm-list">
              {items.map((item) => (
                <div key={item.id} className="order-confirm-item">
                  <span className="order-confirm-name">
                    {item.name}
                    {item.temperature && <span className="order-confirm-temp">{item.temperature}</span>}
                  </span>
                  <span className="order-confirm-qty">{item.quantity}잔</span>
                  <span className="order-confirm-price">{item.totalPrice.toLocaleString()}원</span>
                </div>
              ))}
            </div>
            <div className="order-confirm-total">
              <span>총 금액</span>
              <span className="order-confirm-total-price">
                {items.reduce((sum, item) => sum + item.totalPrice, 0).toLocaleString()}원
              </span>
            </div>
            <div className="modal-buttons order-confirm-buttons">
              <button
                className="order-confirm-cancel-btn"
                onClick={() => {
                  stopTTSRef.current();
                  setShowOrderConfirmModal(false);
                }}
              >
                취소
              </button>
              <button
                className="order-confirm-submit-btn"
                onClick={handleConfirmOrder}
              >
                주문하기
              </button>
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
                  onClick={() => {
                    stopTTSRef.current();
                    handleVoiceTemperatureSelect('HOT');
                  }}
                >
                  <span>🔥</span>
                  <span>HOT</span>
                </button>
              )}
              {temperatureConflicts[0].menuItem.temperatures.includes('ICE') && (
                <button
                  className="voice-temp-btn voice-temp-ice"
                  onClick={() => {
                    stopTTSRef.current();
                    handleVoiceTemperatureSelect('ICE');
                  }}
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
