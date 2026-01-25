'use client';

import { useState, useCallback, useRef } from 'react';
import { useOrderStore } from '@/store/orderStore';
import { useQueueStore } from '@/store/queueStore';
import { useChatStore } from '@/store/chatStore';
import { matchVoiceToMenu, formatOrderConfirmation, type MatchedOrder } from '@/utils/menuMatcher';
import { isEcho } from '@/utils/echoFilter';

type VoiceState = 'idle' | 'listening' | 'timeout' | 'success';

// 주문 무관 안내 메시지
const ORDER_ONLY_MESSAGE = '저는 주문과 관련된 대화만 가능합니다. 주문과 관련된 말씀 부탁드립니다.';

// ═══════════════════════════════════════════════════════════════════════════
// 키워드 기반 의도 분류 함수들
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 긍정 응답 여부 확인
 */
export function isConfirmation(text: string): boolean {
  const confirmKeywords = ['네', '응', '예', '좋아', '좋아요', '그래', '그래요', '핫으로', '핫으로 해', '핫으로 해주세요', '그걸로', '그걸로 해', '괜찮아', '괜찮아요'];
  const lowerText = text.toLowerCase().trim();
  return confirmKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * 거부 응답 여부 확인
 */
export function isRejection(text: string): boolean {
  const rejectKeywords = ['아니', '아니요', '아뇨', '싫어', '싫어요', '다른', '다른거', '다른 거', '취소', '안 할래', '안할래', '됐어', '됐어요'];
  const lowerText = text.toLowerCase().trim();
  return rejectKeywords.some(keyword => lowerText.includes(keyword));
}

/**
 * 온도 응답 추출 (HOT/ICE)
 */
export function isTemperatureResponse(text: string): 'HOT' | 'ICE' | null {
  const lowerText = text.toLowerCase().trim();
  const hotKeywords = ['핫', '따뜻한', '따듯한', '뜨거운', '따뜻하게', '따듯하게', '뜨겁게', 'hot'];
  const iceKeywords = ['아이스', '차가운', '시원한', '차갑게', '시원하게', 'ice', 'iced'];

  if (iceKeywords.some(k => lowerText.includes(k))) return 'ICE';
  if (hotKeywords.some(k => lowerText.includes(k))) return 'HOT';
  return null;
}

/**
 * 주문 확정 의도 확인
 */
export function isOrderConfirmIntent(text: string): boolean {
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
}

/**
 * 주문 관련 발화인지 확인
 */
export function isOrderRelated(text: string, matchResult: ReturnType<typeof matchVoiceToMenu>): boolean {
  if (matchResult.orders.length > 0) return true;
  if (matchResult.temperatureConflicts.length > 0) return true;
  if (matchResult.unmatched.length > 0) return true;
  if (isConfirmation(text) || isRejection(text)) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════════════════
// useVoiceOrderProcessor Hook
// ═══════════════════════════════════════════════════════════════════════════

interface UseVoiceOrderProcessorOptions {
  /** TTS 재생 함수 */
  speakRef: React.MutableRefObject<(text: string) => void>;
  /** 활동 타이머 리셋 함수 */
  resetActivity: () => void;
}

interface UseVoiceOrderProcessorReturn {
  /** 현재 음성 상태 */
  voiceState: VoiceState;
  /** 음성 상태 설정 */
  setVoiceState: React.Dispatch<React.SetStateAction<VoiceState>>;
  /** 온도 선택이 필요한 주문들 */
  temperatureConflicts: MatchedOrder[];
  /** 음성 인식 결과 처리 핸들러 */
  handleSpeechResult: (text: string, isFinal: boolean) => void;
  /** 주문 처리 - 온도 선택이 필요한 항목 반환 */
  processMatchedOrders: (orders: MatchedOrder[]) => MatchedOrder[];
  /** 음성 주문 시 터치로 온도 선택 */
  handleVoiceTemperatureSelect: (temp: 'HOT' | 'ICE') => void;
  /** interim 메시지 ID ref */
  interimMessageIdRef: React.MutableRefObject<string | null>;
  /** 상태 초기화 (세션 종료 시 사용) */
  resetState: () => void;
}

export function useVoiceOrderProcessor({
  speakRef,
  resetActivity,
}: UseVoiceOrderProcessorOptions): UseVoiceOrderProcessorReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [temperatureConflicts, setTemperatureConflicts] = useState<MatchedOrder[]>([]);
  const interimMessageIdRef = useRef<string | null>(null);

  // Order store
  const addItem = useOrderStore((state) => state.addItem);
  const items = useOrderStore((state) => state.items);
  const clearOrder = useOrderStore((state) => state.clearOrder);
  const addToQueue = useQueueStore((state) => state.addToQueue);

  // Chat store
  const addUserVoice = useChatStore((state) => state.addUserVoice);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const removeMessage = useChatStore((state) => state.removeMessage);
  const addAssistantResponse = useChatStore((state) => state.addAssistantResponse);
  const setTyping = useChatStore((state) => state.setTyping);
  const clearMessages = useChatStore((state) => state.clearMessages);

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

  // Speech-to-text result handler
  const handleSpeechResult = useCallback((text: string, isFinal: boolean) => {
    console.log('[VoiceOrderProcessor] handleSpeechResult called:', { text, isFinal });

    // 에코 필터링 - TTS 음성이 마이크로 들어온 경우 무시
    const echoCheck = isEcho(text);
    if (echoCheck.isEcho) {
      console.log('[VoiceOrderProcessor] Echo detected, ignoring:', text, echoCheck.reason);
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
      console.log('[VoiceOrderProcessor] Processing final result (passed echo filter)');

      // 임시 메시지가 있으면 삭제
      if (interimMessageIdRef.current) {
        removeMessage(interimMessageIdRef.current);
        interimMessageIdRef.current = null;
      }

      setVoiceState('success');
      setTyping(true);

      // 1. 주문 확정 의도 체크
      if (isOrderConfirmIntent(text)) {
        console.log('[VoiceOrderProcessor] Order confirm intent detected:', text);
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
        console.log('[VoiceOrderProcessor] Processing temperature conflict response:', text);

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
          console.log('[VoiceOrderProcessor] Menu match result (with pending conflicts):', matchResult);

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
            console.log('[VoiceOrderProcessor] Non-order message during conflict, showing guide');
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
      console.log('[VoiceOrderProcessor] Menu match result:', matchResult);

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
        console.log('[VoiceOrderProcessor] Non-order message, showing guide');
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
    processMatchedOrders, temperatureConflicts, addItem, items, addToQueue,
    clearOrder, clearMessages, resetActivity, speakRef
  ]);

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
  }, [temperatureConflicts, addItem, addAssistantResponse, resetActivity, speakRef]);

  // 상태 초기화 (세션 종료 시 사용)
  const resetState = useCallback(() => {
    setVoiceState('idle');
    setTemperatureConflicts([]);
    interimMessageIdRef.current = null;
  }, []);

  return {
    voiceState,
    setVoiceState,
    temperatureConflicts,
    handleSpeechResult,
    processMatchedOrders,
    handleVoiceTemperatureSelect,
    interimMessageIdRef,
    resetState,
  };
}
