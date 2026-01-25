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
import { useOrderStore } from '@/store/orderStore';
import { useQueueStore } from '@/store/queueStore';
import { useChatStore } from '@/store/chatStore';
import { matchVoiceToMenu, formatOrderConfirmation, type MatchedOrder } from '@/utils/menuMatcher';
import { isEcho, onTTSStart, onTTSEnd, resetEchoFilter } from '@/utils/echoFilter';
import type { MenuItem } from '@/types/menu';

type VoiceState = 'idle' | 'listening' | 'timeout' | 'success';

const VOICE_TIMEOUT = 30; // 음성 입력 종료 시점 (세션 잔여 시간 기준, 초)
const SESSION_WARNING = 10; // 세션 종료 임박 경고 (초)

export default function Home() {
  const [showSplash, setShowSplash] = useState(true);
  const [showTemperatureModal, setShowTemperatureModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [pendingOrders, setPendingOrders] = useState<MatchedOrder[]>([]);
  const [temperatureConflicts, setTemperatureConflicts] = useState<MatchedOrder[]>([]);

  // 얼굴 인식 On/Off
  const [faceDetectionEnabled, setFaceDetectionEnabled] = useState(true);

  const hasAutoStartedRef = useRef(false);
  const interimMessageIdRef = useRef<string | null>(null);
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
  const addUserVoice = useChatStore((state) => state.addUserVoice);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const removeMessage = useChatStore((state) => state.removeMessage);
  const addAssistantResponse = useChatStore((state) => state.addAssistantResponse);
  const setTyping = useChatStore((state) => state.setTyping);
  const clearMessages = useChatStore((state) => state.clearMessages);

  // Session timeout handler - 세션 타임아웃 시 호출, 스플래시 화면으로 복귀
  const handleSessionTimeout = useCallback(() => {
    console.log('[Page] Session timeout - returning to splash');
    setVoiceState('idle');
    setShowTemperatureModal(false);
    setSelectedItem(null);
    setPendingOrders([]);
    setTemperatureConflicts([]);
    clearOrder();
    clearMessages();
    resetEchoFilter();
    hasAutoStartedRef.current = false;
    interimMessageIdRef.current = null;
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

  // Process matched orders - add to order or return items needing temperature selection
  const processMatchedOrders = useCallback((orders: MatchedOrder[]): MatchedOrder[] => {
    const needsTemperature: MatchedOrder[] = [];

    for (const order of orders) {
      if (order.temperature === null && order.menuItem.temperatures.length > 1) {
        // Need to select temperature - don't add yet, return for question
        needsTemperature.push({
          ...order,
          needsTemperatureConfirm: false, // 단순 온도 선택 (충돌 아님)
        });
      } else {
        // Can add directly
        const temp = order.temperature ?? order.menuItem.temperatures[0] ?? null;
        for (let i = 0; i < order.quantity; i++) {
          addItem(order.menuItem, temp);
        }
      }
    }

    return needsTemperature;
  }, [addItem]);

  // 주문 무관 안내 메시지
  const ORDER_ONLY_MESSAGE = '저는 주문과 관련된 대화만 가능합니다. 주문과 관련된 말씀 부탁드립니다.';

  // 키워드 기반 의도 분류 함수들
  const isConfirmation = useCallback((text: string): boolean => {
    const confirmKeywords = ['네', '응', '예', '좋아', '좋아요', '그래', '그래요', '핫으로', '핫으로 해', '핫으로 해주세요', '그걸로', '그걸로 해', '괜찮아', '괜찮아요'];
    const lowerText = text.toLowerCase().trim();
    return confirmKeywords.some(keyword => lowerText.includes(keyword));
  }, []);

  const isRejection = useCallback((text: string): boolean => {
    const rejectKeywords = ['아니', '아니요', '아뇨', '싫어', '싫어요', '다른', '다른거', '다른 거', '취소', '안 할래', '안할래', '됐어', '됐어요'];
    const lowerText = text.toLowerCase().trim();
    return rejectKeywords.some(keyword => lowerText.includes(keyword));
  }, []);

  const isTemperatureResponse = useCallback((text: string): 'HOT' | 'ICE' | null => {
    const lowerText = text.toLowerCase().trim();
    const hotKeywords = ['핫', '따뜻한', '따듯한', '뜨거운', '따뜻하게', '따듯하게', '뜨겁게', 'hot'];
    const iceKeywords = ['아이스', '차가운', '시원한', '차갑게', '시원하게', 'ice', 'iced'];

    if (iceKeywords.some(k => lowerText.includes(k))) return 'ICE';
    if (hotKeywords.some(k => lowerText.includes(k))) return 'HOT';
    return null;
  }, []);

  const isOrderConfirmIntent = useCallback((text: string): boolean => {
    const confirmIntentKeywords = [
      '이대로 주문', '이대로 해', '이걸로 해', '이걸로 주문',
      '주문할게', '주문 할게', '주문해줘', '주문 해줘',
      '결제할게', '결제 할게', '결제해줘', '결제 해줘',
      '계산할게', '계산 할게', '계산해줘', '계산 해줘',
      '끝이야', '끝 이야', '다 됐어', '다됐어', '다 했어',
      '그게 다야', '그게 전부야', '더 없어', '더없어',
      '주문 완료', '주문완료', '확정', '완료',
    ];
    const lowerText = text.toLowerCase().trim();
    return confirmIntentKeywords.some(keyword => lowerText.includes(keyword));
  }, []);

  const isOrderRelated = useCallback((text: string, matchResult: ReturnType<typeof matchVoiceToMenu>): boolean => {
    if (matchResult.orders.length > 0) return true;
    if (matchResult.temperatureConflicts.length > 0) return true;
    if (matchResult.unmatched.length > 0) return true;
    if (isConfirmation(text) || isRejection(text)) return true;
    return false;
  }, [isConfirmation, isRejection]);

  // Speech-to-text handlers
  const handleSpeechResult = useCallback((text: string, isFinal: boolean) => {
    console.log('[Page] handleSpeechResult called:', { text, isFinal });

    // 에코 필터링 - TTS 음성이 마이크로 들어온 경우 무시
    const echoCheck = isEcho(text);
    if (echoCheck.isEcho) {
      console.log('[Page] Echo detected, ignoring:', text, echoCheck.reason);
      // 임시 메시지도 삭제
      if (interimMessageIdRef.current) {
        removeMessage(interimMessageIdRef.current);
        interimMessageIdRef.current = null;
      }
      return;
    }

    // 음성 입력 시 활동 타이머 리셋
    resetActivity();

    if (isFinal && text.trim()) {
      console.log('[Page] Processing final result (passed echo filter)');

      // 임시 메시지가 있으면 삭제
      if (interimMessageIdRef.current) {
        removeMessage(interimMessageIdRef.current);
        interimMessageIdRef.current = null;
      }

      setVoiceState('success');
      setTyping(true);

      // 1. 주문 확정 의도 체크
      if (isOrderConfirmIntent(text)) {
        console.log('[Page] Order confirm intent detected:', text);
        addUserVoice(text, false);

        if (temperatureConflicts.length > 0) {
          // 온도 선택 대기 중이면 먼저 처리해야 함
          const conflict = temperatureConflicts[0];
          const msg = `먼저 ${conflict.menuItem.name}의 온도를 선택해주세요. 따뜻하게 또는 차갑게라고 말씀해주세요.`;
          setTimeout(() => {
            addAssistantResponse(msg);
            speakRef.current(msg);
          }, 300);
        } else if (items.length > 0) {
          // 주문 내역이 있으면 확정 (quantity 고려)
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
          }, 300);
        } else {
          // 주문 내역이 없으면 안내
          setTimeout(() => {
            const msg = '아직 주문 내역이 없어요. 먼저 메뉴를 선택해주세요.';
            addAssistantResponse(msg);
            speakRef.current(msg);
          }, 300);
        }
        setTyping(false);
        return;
      }

      // 2. 온도 충돌 처리 중인 경우
      if (temperatureConflicts.length > 0) {
        const currentConflict = temperatureConflicts[0];
        console.log('[Page] Processing temperature conflict response:', text);

        // 먼저 온도 응답인지 확인
        const tempResponse = isTemperatureResponse(text);

        if (tempResponse !== null) {
          addUserVoice(text, false);

          if (currentConflict.menuItem.temperatures.includes(tempResponse)) {
            // 가능한 온도 - 주문에 추가
            for (let i = 0; i < currentConflict.quantity; i++) {
              addItem(currentConflict.menuItem, tempResponse);
            }

            const remainingConflicts = temperatureConflicts.slice(1);
            setTemperatureConflicts(remainingConflicts);

            const tempKo = tempResponse === 'HOT' ? '핫' : '아이스';
            let response = `${currentConflict.menuItem.name} ${tempKo}으로 추가했어요.`;

            if (remainingConflicts.length > 0) {
              const next = remainingConflicts[0];
              if (next.needsTemperatureConfirm && next.requestedTemperature) {
                const nextReqTempKo = next.requestedTemperature === 'ICE' ? '아이스' : '핫';
                const nextAvailTempKo = next.availableTemperature === 'ICE' ? '아이스' : '핫';
                response += ` ${next.menuItem.name}은 ${nextReqTempKo}가 없어요. ${nextAvailTempKo}으로 드릴까요?`;
              } else {
                response += ` ${next.menuItem.name} 온도를 선택해주세요. 따뜻하게 또는 차갑게라고 말씀해주세요.`;
              }
            } else {
              response += ' 더 필요하신 게 있으신가요?';
            }

            setTimeout(() => {
              addAssistantResponse(response);
              speakRef.current(response);
            }, 300);
          } else {
            // 불가능한 온도 - 안내
            const tempKo = tempResponse === 'HOT' ? '핫' : '아이스';
            const availTempKo = currentConflict.menuItem.temperatures[0] === 'HOT' ? '핫' : '아이스';
            const response = `${currentConflict.menuItem.name}은 ${tempKo}가 없어요. ${availTempKo}만 가능해요. ${availTempKo}으로 드릴까요?`;

            setTimeout(() => {
              addAssistantResponse(response);
              speakRef.current(response);
            }, 300);
          }
        } else if (isConfirmation(text)) {
          addUserVoice(text, false);

          const temp = currentConflict.availableTemperature ?? currentConflict.menuItem.temperatures[0]!;
          for (let i = 0; i < currentConflict.quantity; i++) {
            addItem(currentConflict.menuItem, temp);
          }

          const remainingConflicts = temperatureConflicts.slice(1);
          setTemperatureConflicts(remainingConflicts);

          const tempKo = temp === 'HOT' ? '핫' : '아이스';
          let response = `${currentConflict.menuItem.name} ${tempKo}으로 추가했어요.`;

          if (remainingConflicts.length > 0) {
            const next = remainingConflicts[0];
            if (next.needsTemperatureConfirm && next.requestedTemperature) {
              const nextReqTempKo = next.requestedTemperature === 'ICE' ? '아이스' : '핫';
              const nextAvailTempKo = next.availableTemperature === 'ICE' ? '아이스' : '핫';
              response += ` ${next.menuItem.name}은 ${nextReqTempKo}가 없어요. ${nextAvailTempKo}으로 드릴까요?`;
            } else {
              response += ` ${next.menuItem.name} 온도를 선택해주세요. 따뜻하게 또는 차갑게라고 말씀해주세요.`;
            }
          } else {
            response += ' 더 필요하신 게 있으신가요?';
          }

          setTimeout(() => {
            addAssistantResponse(response);
            speakRef.current(response);
          }, 300);
        } else if (isRejection(text)) {
          addUserVoice(text, false);

          const remainingConflicts = temperatureConflicts.slice(1);
          setTemperatureConflicts(remainingConflicts);

          let response = `${currentConflict.menuItem.name}은 주문에서 뺐어요.`;

          if (remainingConflicts.length > 0) {
            const next = remainingConflicts[0];
            if (next.needsTemperatureConfirm && next.requestedTemperature) {
              const nextReqTempKo = next.requestedTemperature === 'ICE' ? '아이스' : '핫';
              const nextAvailTempKo = next.availableTemperature === 'ICE' ? '아이스' : '핫';
              response += ` ${next.menuItem.name}은 ${nextReqTempKo}가 없어요. ${nextAvailTempKo}으로 드릴까요?`;
            } else {
              response += ` ${next.menuItem.name} 온도를 선택해주세요. 따뜻하게 또는 차갑게라고 말씀해주세요.`;
            }
          } else {
            response += ' 다른 메뉴를 주문하시겠어요?';
          }

          setTimeout(() => {
            addAssistantResponse(response);
            speakRef.current(response);
          }, 300);
        } else {
          // 새로운 주문 시도
          const matchResult = matchVoiceToMenu(text);
          console.log('[Page] Menu match result (with pending conflicts):', matchResult);

          if (matchResult.orders.length > 0 || matchResult.temperatureConflicts.length > 0) {
            addUserVoice(text, false);

            const needsTemp = processMatchedOrders(matchResult.orders);
            setTemperatureConflicts(prev => [...prev, ...matchResult.temperatureConflicts, ...needsTemp]);

            const response = formatOrderConfirmation(matchResult);
            setTimeout(() => {
              addAssistantResponse(response);
              speakRef.current(response);
            }, 300);
          } else {
            console.log('[Page] Non-order message during conflict, showing guide');
            setTimeout(() => {
              addAssistantResponse(ORDER_ONLY_MESSAGE);
              speakRef.current(ORDER_ONLY_MESSAGE);
            }, 300);
          }
        }
        setTyping(false);
        return;
      }

      // 3. 일반 주문 처리
      const matchResult = matchVoiceToMenu(text);
      console.log('[Page] Menu match result:', matchResult);

      if (isOrderRelated(text, matchResult)) {
        addUserVoice(text, false);

        if (matchResult.orders.length > 0 || matchResult.temperatureConflicts.length > 0) {
          const needsTemp = processMatchedOrders(matchResult.orders);
          setTemperatureConflicts([...matchResult.temperatureConflicts, ...needsTemp]);

          const response = formatOrderConfirmation(matchResult);
          setTimeout(() => {
            addAssistantResponse(response);
            speakRef.current(response);
          }, 300);
        } else if (matchResult.unmatched.length > 0) {
          const response = formatOrderConfirmation(matchResult);
          setTimeout(() => {
            addAssistantResponse(response);
            speakRef.current(response);
          }, 300);
        }
      } else {
        console.log('[Page] Non-order message, showing guide');
        setTimeout(() => {
          addAssistantResponse(ORDER_ONLY_MESSAGE);
          speakRef.current(ORDER_ONLY_MESSAGE);
        }, 300);
      }

      setTyping(false);
    } else if (!isFinal && text.trim()) {
      // Interim result
      if (interimMessageIdRef.current) {
        updateMessage(interimMessageIdRef.current, text, true);
      } else {
        interimMessageIdRef.current = addUserVoice(text, true);
      }
    }
  }, [
    addUserVoice, updateMessage, removeMessage, addAssistantResponse, setTyping,
    processMatchedOrders, temperatureConflicts, isConfirmation, isRejection,
    isTemperatureResponse, isOrderConfirmIntent, isOrderRelated, addItem,
    items, addToQueue, clearOrder, clearMessages, resetActivity
  ]);

  // 얼굴 인식 토글
  const toggleFaceDetection = useCallback(() => {
    setFaceDetectionEnabled(prev => !prev);
  }, []);

  const handleSilenceTimeout = useCallback(() => {
    if (interimMessageIdRef.current) {
      removeMessage(interimMessageIdRef.current);
      interimMessageIdRef.current = null;
    }
    // timeout 상태로 설정 (다시 시도 버튼 표시)
    setVoiceState('timeout');
    const msg = '15초간 음성이 없어서 마이크를 껐어요. 버튼을 눌러 다시 주문해주세요.';
    addAssistantResponse(msg);
    speakRef.current(msg);
    // 음성 타임아웃 시에도 활동으로 간주하지 않음 - 세션 타이머는 계속 진행
  }, [addAssistantResponse, removeMessage]);

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
  }, [sttState]);

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
  const handleSplashStart = useCallback(() => {
    // 스플래시에서 시작 시 경고 플래그 초기화
    hasShownMicTimeoutRef.current = false;
    hasShownSessionWarningRef.current = false;
    setShowSplash(false);
  }, []);

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

  // 음성 주문 시 터치로 온도 선택
  const handleVoiceTemperatureSelect = useCallback((temp: 'HOT' | 'ICE') => {
    resetActivity(); // 활동 타이머 리셋

    if (temperatureConflicts.length === 0) return;

    const currentConflict = temperatureConflicts[0];

    if (currentConflict.menuItem.temperatures.includes(temp)) {
      for (let i = 0; i < currentConflict.quantity; i++) {
        addItem(currentConflict.menuItem, temp);
      }

      const remainingConflicts = temperatureConflicts.slice(1);
      setTemperatureConflicts(remainingConflicts);

      const tempKo = temp === 'HOT' ? '핫' : '아이스';
      let response = `${currentConflict.menuItem.name} ${tempKo}으로 추가했어요.`;

      if (remainingConflicts.length > 0) {
        const next = remainingConflicts[0];
        response += ` ${next.menuItem.name} 온도를 선택해주세요.`;
      } else {
        response += ' 더 필요하신 게 있으신가요?';
      }

      addAssistantResponse(response);
      speakRef.current(response);
    }
  }, [temperatureConflicts, addItem, addAssistantResponse, resetActivity]);

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
  }, [items, addToQueue, clearOrder, clearMessages, addAssistantResponse, stopSession]);

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
    startListening();
  }, [startListening, resetActivity]);

  const handleStopListening = useCallback(() => {
    console.log('[Page] handleStopListening called');
    if (interimMessageIdRef.current) {
      removeMessage(interimMessageIdRef.current);
      interimMessageIdRef.current = null;
    }
    stopListening();
  }, [stopListening, removeMessage]);

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
