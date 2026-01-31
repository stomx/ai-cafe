'use client';

import { useState, useCallback, useRef } from 'react';
import { useOrderStore } from '@/store/orderStore';
import { useQueueStore } from '@/store/queueStore';
import { useChatStore } from '@/store/chatStore';
import { matchVoiceToMenu, formatOrderConfirmation, type MatchedOrder } from '@/utils/menuMatcher';
import { isEcho } from '@/utils/echoFilter';
import { useOrderActions } from './useOrderActions';
import { useGeminiOrder } from './useGeminiOrder';

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
 * 주의: 메뉴 추가 요청과 혼동되지 않도록 엄격하게 매칭
 */
export function isOrderConfirmIntent(text: string): boolean {
  const lowerText = text.toLowerCase().trim();

  // 1. 명확한 주문 확정 키워드 (부분 매칭)
  const confirmKeywords = [
    '이대로 주문', '이대로 해', '이걸로 해', '이걸로 주문',
    '주문할게', '주문 할게', '주문해줘', '주문 해줘',
    '결제할게', '결제 할게', '결제해줘', '결제 해줘',
    '계산할게', '계산 할게', '계산해줘', '계산 해줘',
    '주문 완료', '주문완료',
  ];

  // 2. 단독으로 사용되는 짧은 키워드 (문장 끝에서만 매칭하거나 단독 사용)
  const endKeywords = [
    '끝이야', '끝 이야', '그게 다야', '그게 전부야',
  ];

  // 3. "다 됐어" 패턴 - "다섯" 등의 숫자와 혼동 방지
  // "다 됐" 패턴은 앞에 숫자(다섯, 다섯잔 등)가 없을 때만 매칭
  const donePatterns = [
    /(?<!다섯|하나|둘|셋|넷|여섯|일곱|여덟|아홉|열)다\s*됐/, // "다 됐어", "다됐어"
    /(?<!다섯|하나|둘|셋|넷|여섯|일곱|여덟|아홉|열)다\s*했/, // "다 했어"
  ];

  // 4. "더 없어" 패턴 - 단독 또는 문장 끝에서만
  const noMorePatterns = [
    /더\s*없어[요]?$/,
    /^더\s*없어[요]?/,
  ];

  // 부분 매칭 키워드 체크
  if (confirmKeywords.some(keyword => lowerText.includes(keyword))) {
    console.log('[isOrderConfirmIntent] Matched keyword:', lowerText);
    return true;
  }

  // 문장 끝 키워드 체크
  if (endKeywords.some(keyword => lowerText.endsWith(keyword) || lowerText === keyword)) {
    console.log('[isOrderConfirmIntent] Matched end keyword:', lowerText);
    return true;
  }

  // 정규식 패턴 체크
  if (donePatterns.some(pattern => pattern.test(lowerText))) {
    console.log('[isOrderConfirmIntent] Matched done pattern:', lowerText);
    return true;
  }

  if (noMorePatterns.some(pattern => pattern.test(lowerText))) {
    console.log('[isOrderConfirmIntent] Matched no-more pattern:', lowerText);
    return true;
  }

  return false;
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
  /** Gemini LLM 사용 여부 (기본값: true) */
  useGemini?: boolean;
  /** 주문 확인 모달 표시 여부 */
  showOrderConfirmModal?: boolean;
  /** 주문 확인 모달 표시 요청 콜백 */
  onShowOrderConfirm?: () => void;
  /** 실제 주문 확정 콜백 (모달에서 결제 확인) */
  onConfirmOrder?: () => void;
  /** 주문 확정 완료 시 콜백 (UI 상태 정리용) */
  onOrderConfirmed?: () => void;
}

interface UseVoiceOrderProcessorReturn {
  /** 현재 음성 상태 */
  voiceState: VoiceState;
  /** 음성 상태 설정 */
  setVoiceState: React.Dispatch<React.SetStateAction<VoiceState>>;
  /** 온도 선택이 필요한 주문들 */
  temperatureConflicts: MatchedOrder[];
  /** 온도 충돌 처리 중 추가된 아이템 (마지막에 통합 메시지용) */
  pendingAddedItems: Array<{ name: string; temperature: 'HOT' | 'ICE'; quantity: number }>;
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
  useGemini = true,
  showOrderConfirmModal = false,
  onShowOrderConfirm,
  onConfirmOrder,
  onOrderConfirmed,
}: UseVoiceOrderProcessorOptions): UseVoiceOrderProcessorReturn {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [temperatureConflicts, setTemperatureConflicts] = useState<MatchedOrder[]>([]);
  // 온도 확정 후 추가될 아이템들 (온도가 이미 결정된 아이템)
  const [pendingOrders, setPendingOrders] = useState<MatchedOrder[]>([]);
  // 온도 충돌 처리 중 추가된 아이템 추적 (마지막에 통합 메시지용)
  const [pendingAddedItems, setPendingAddedItems] = useState<Array<{
    name: string;
    temperature: 'HOT' | 'ICE';
    quantity: number;
  }>>([]);
  const interimMessageIdRef = useRef<string | null>(null);
  const isProcessingGeminiRef = useRef(false);

  // Order store
  const addItem = useOrderStore((state) => state.addItem);
  const items = useOrderStore((state) => state.items);
  const clearOrder = useOrderStore((state) => state.clearOrder);
  const addToQueue = useQueueStore((state) => state.addToQueue);

  // Order actions hook (CTA 핸들러 통합)
  const orderActions = useOrderActions({
    onOrderConfirmed,
    onNeedTemperatureSelect: (menuItem, quantity) => {
      setTemperatureConflicts(prev => [...prev, { menuItem, quantity, temperature: null }]);
    },
  });

  // Gemini order processor
  const { processVoiceInput: processWithGemini, isGeminiAvailable } = useGeminiOrder({
    actions: orderActions,
    enabled: useGemini,
  });

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

  // 기존 menuMatcher를 사용한 폴백 처리
  const fallbackToMenuMatcher = useCallback((text: string) => {
    console.log('[VoiceOrderProcessor] Using menuMatcher fallback');
    const matchResult = matchVoiceToMenu(text);
    console.log('[VoiceOrderProcessor] Menu match result:', matchResult);

    if (isOrderRelated(text, matchResult)) {
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
  }, [processMatchedOrders, addAssistantResponse, setTyping, speakRef]);

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
          // 주문 내역이 있는 경우
          if (showOrderConfirmModal) {
            // 모달이 이미 열려있으면 → 바로 주문 완료
            console.log('[VoiceOrderProcessor] Modal open, confirming order');
            if (onConfirmOrder) {
              onConfirmOrder();
            }
          } else {
            // 모달이 닫혀있으면 → 주문 확인 모달 표시
            console.log('[VoiceOrderProcessor] Showing order confirm modal');
            if (onShowOrderConfirm) {
              onShowOrderConfirm();
            }
          }
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

            // 추가된 아이템 정보 저장
            const newAddedItem = {
              name: currentConflict.menuItem.name,
              temperature: tempResponse,
              quantity: currentConflict.quantity,
            };

            const remainingConflicts = temperatureConflicts.slice(1);
            setTemperatureConflicts(remainingConflicts);

            let response = '';

            if (remainingConflicts.length > 0) {
              // 남은 충돌이 있으면: 추가된 아이템 저장 + 다음 온도 질문만
              setPendingAddedItems(prev => [...prev, newAddedItem]);

              const next = remainingConflicts[0];
              if (next.needsTemperatureConfirm && next.requestedTemperature) {
                const nextReqTempKo = next.requestedTemperature === 'ICE' ? '아이스' : '따뜻한 메뉴';
                const nextAvailTempKo = next.availableTemperature === 'ICE' ? '아이스' : '따뜻한 것';
                response = `${next.menuItem.name}은 ${nextReqTempKo}가 없어요. ${nextAvailTempKo}으로 드릴까요?`;
              } else {
                response = `${next.menuItem.name} 온도를 선택해주세요. 따뜻하게 또는 차갑게라고 말씀해주세요.`;
              }
            } else {
              // 남은 충돌 없음: pendingOrders와 모든 추가된 아이템 통합 메시지
              const allAddedItems: Array<{ name: string; temperature: 'HOT' | 'ICE'; quantity: number }> = [];

              // 1. pendingOrders 먼저 추가 (온도 확정 아이템: 콜드브루 등)
              for (const order of pendingOrders) {
                for (let i = 0; i < order.quantity; i++) {
                  addItem(order.menuItem, order.temperature!);
                }
                allAddedItems.push({
                  name: order.menuItem.name,
                  temperature: order.temperature!,
                  quantity: order.quantity,
                });
              }

              // 2. pendingAddedItems 추가 (이전에 온도 선택한 아이템들)
              allAddedItems.push(...pendingAddedItems);

              // 3. 현재 온도 선택한 아이템 추가
              allAddedItems.push(newAddedItem);

              // 통합 메시지 생성
              const itemsStr = allAddedItems.map(item => {
                const tempKo = item.temperature === 'HOT' ? '따뜻한' : item.temperature === 'ICE' ? '아이스' : '';
                return tempKo ? `${tempKo} ${item.name} ${item.quantity}잔` : `${item.name} ${item.quantity}잔`;
              }).join(', ');
              response = `${itemsStr} 추가했습니다. 더 필요하신 게 있으신가요?`;
              setPendingAddedItems([]); // 초기화
              setPendingOrders([]); // 초기화
            }

            setTimeout(() => {
              addAssistantResponse(response);
              speakRef.current(response);
            }, 300);
          } else {
            // 불가능한 온도 - 안내
            const tempKo = tempResponse === 'HOT' ? '따뜻한 메뉴' : '아이스';
            const availTempKo = currentConflict.menuItem.temperatures[0] === 'HOT' ? '따뜻한 것' : '아이스';
            const response = `${currentConflict.menuItem.name}은 ${tempKo}가 없어요. ${availTempKo}만 가능해요. ${availTempKo}로 드릴까요?`;

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

          // 추가된 아이템 정보 저장
          const newAddedItem = {
            name: currentConflict.menuItem.name,
            temperature: temp,
            quantity: currentConflict.quantity,
          };

          const remainingConflicts = temperatureConflicts.slice(1);
          setTemperatureConflicts(remainingConflicts);

          let response = '';

          if (remainingConflicts.length > 0) {
            // 남은 충돌이 있으면: 추가된 아이템 저장 + 다음 온도 질문만
            setPendingAddedItems(prev => [...prev, newAddedItem]);

            const next = remainingConflicts[0];
            if (next.needsTemperatureConfirm && next.requestedTemperature) {
              const nextReqTempKo = next.requestedTemperature === 'ICE' ? '아이스' : '따뜻한 메뉴';
              const nextAvailTempKo = next.availableTemperature === 'ICE' ? '아이스' : '따뜻한 것';
              response = `${next.menuItem.name}은 ${nextReqTempKo}가 없어요. ${nextAvailTempKo}으로 드릴까요?`;
            } else {
              response = `${next.menuItem.name} 따뜻하게 드릴까요, 차갑게 드릴까요?`;
            }
          } else {
            // 남은 충돌 없음: 모든 추가된 아이템 통합 메시지
            const allAddedItems = [...pendingAddedItems, newAddedItem];
            const itemsStr = allAddedItems.map(item => {
              const tempKo = item.temperature === 'HOT' ? '따뜻한' : '아이스';
              return `${tempKo} ${item.name} ${item.quantity}잔`;
            }).join(', ');
            response = `${itemsStr} 추가했습니다. 더 필요하신 게 있으신가요?`;
            setPendingAddedItems([]); // 초기화
          }

          setTimeout(() => {
            addAssistantResponse(response);
            speakRef.current(response);
          }, 300);
        } else if (isRejection(text)) {
          addUserVoice(text, false);

          const remainingConflicts = temperatureConflicts.slice(1);
          setTemperatureConflicts(remainingConflicts);

          let response = '';

          if (remainingConflicts.length > 0) {
            // 남은 충돌이 있으면: 다음 온도 질문만
            const next = remainingConflicts[0];
            if (next.needsTemperatureConfirm && next.requestedTemperature) {
              const nextReqTempKo = next.requestedTemperature === 'ICE' ? '아이스' : '따뜻한 메뉴';
              const nextAvailTempKo = next.availableTemperature === 'ICE' ? '아이스' : '따뜻한 것';
              response = `${currentConflict.menuItem.name}은 뺐어요. ${next.menuItem.name}은 ${nextReqTempKo}가 없어요. ${nextAvailTempKo}으로 드릴까요?`;
            } else {
              response = `${currentConflict.menuItem.name}은 뺐어요. ${next.menuItem.name} 따뜻하게 드릴까요, 차갑게 드릴까요?`;
            }
          } else {
            // 남은 충돌 없음: 추가된 아이템이 있으면 통합 메시지
            if (pendingAddedItems.length > 0) {
              const itemsStr = pendingAddedItems.map(item => {
                const tempKo = item.temperature === 'HOT' ? '따뜻한' : '아이스';
                return `${tempKo} ${item.name} ${item.quantity}잔`;
              }).join(', ');
              response = `${currentConflict.menuItem.name}은 뺐어요. ${itemsStr} 추가했습니다. 더 필요하신 게 있으신가요?`;
              setPendingAddedItems([]); // 초기화
            } else {
              response = `${currentConflict.menuItem.name}은 주문에서 뺐어요. 다른 메뉴를 주문하시겠어요?`;
            }
          }

          setTimeout(() => {
            addAssistantResponse(response);
            speakRef.current(response);
          }, 300);
        } else {
          // 새로운 주문 시도 - 온도 선택 대기 중이므로 주문은 추가하되 메시지는 최소화
          const matchResult = matchVoiceToMenu(text);
          console.log('[VoiceOrderProcessor] Menu match result (with pending conflicts):', matchResult);

          if (matchResult.orders.length > 0 || matchResult.temperatureConflicts.length > 0) {
            addUserVoice(text, false);

            const needsTemp = processMatchedOrders(matchResult.orders);
            // 온도 충돌 목록에 추가 (기존 충돌 유지)
            setTemperatureConflicts(prev => [...prev, ...matchResult.temperatureConflicts, ...needsTemp]);

            // 메시지는 현재 온도 선택 안내만 (중복 메시지 방지)
            const conflict = currentConflict; // 기존 온도 충돌
            const response = `먼저 ${conflict.menuItem.name} 온도를 선택해주세요. 따뜻하게 또는 차갑게라고 말씀해주세요.`;
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

      // 3. 일반 주문 처리 (Gemini 또는 기존 menuMatcher)
      addUserVoice(text, false);

      if (isGeminiAvailable && !isProcessingGeminiRef.current) {
        // Gemini를 사용한 의도 분석
        isProcessingGeminiRef.current = true;
        console.log('[VoiceOrderProcessor] Processing with Gemini:', text);

        processWithGemini(text)
          .then((result) => {
            console.log('[VoiceOrderProcessor] Gemini result:', result);

            // 온도 충돌이 있는 경우: pendingOrders와 temperatureConflicts 저장
            if (result.temperatureConflicts && result.temperatureConflicts.length > 0) {
              setTemperatureConflicts(result.temperatureConflicts);
              if (result.pendingOrders && result.pendingOrders.length > 0) {
                setPendingOrders(result.pendingOrders);
              }

              // 온도 질문만 출력 (아이템 추가는 온도 선택 후)
              const message = result.clarificationData?.question ||
                `${result.temperatureConflicts[0].menuItem.name} 온도를 선택해주세요. 따뜻하게 또는 차갑게라고 말씀해주세요.`;

              setTimeout(() => {
                addAssistantResponse(message);
                speakRef.current(message);
              }, 300);
            } else {
              // 온도 충돌이 없는 경우: 즉시 추가 완료 메시지
              if (result.message) {
                setTimeout(() => {
                  addAssistantResponse(result.message);
                  speakRef.current(result.message);
                }, 300);
              }
            }

            setTyping(false);
          })
          .catch((error) => {
            console.error('[VoiceOrderProcessor] Gemini error:', error);
            // 에러 시 기존 로직으로 폴백
            fallbackToMenuMatcher(text);
          })
          .finally(() => {
            isProcessingGeminiRef.current = false;
          });
      } else {
        // 기존 menuMatcher 사용
        fallbackToMenuMatcher(text);
      }
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
    processMatchedOrders, temperatureConflicts, pendingOrders, pendingAddedItems, addItem, items, addToQueue,
    clearOrder, clearMessages, resetActivity, speakRef, isGeminiAvailable,
    processWithGemini, fallbackToMenuMatcher, showOrderConfirmModal,
    onShowOrderConfirm, onConfirmOrder
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

      // 추가된 아이템 정보 저장
      const newAddedItem = {
        name: currentConflict.menuItem.name,
        temperature: temp,
        quantity: currentConflict.quantity,
      };

      const remainingConflicts = temperatureConflicts.slice(1);
      setTemperatureConflicts(remainingConflicts);

      let response = '';

      if (remainingConflicts.length > 0) {
        // 남은 충돌이 있으면: 추가된 아이템 저장 + 다음 온도 질문만
        setPendingAddedItems(prev => [...prev, newAddedItem]);
        const next = remainingConflicts[0];
        response = `${next.menuItem.name} 온도를 선택해주세요. 따뜻하게 또는 차갑게라고 말씀해주세요.`;
      } else {
        // 남은 충돌 없음: pendingOrders와 모든 추가된 아이템 통합 메시지
        const allAddedItems: Array<{ name: string; temperature: 'HOT' | 'ICE'; quantity: number }> = [];

        // 1. pendingOrders 먼저 추가 (온도 확정 아이템: 콜드브루 등)
        for (const order of pendingOrders) {
          for (let i = 0; i < order.quantity; i++) {
            addItem(order.menuItem, order.temperature!);
          }
          allAddedItems.push({
            name: order.menuItem.name,
            temperature: order.temperature!,
            quantity: order.quantity,
          });
        }

        // 2. pendingAddedItems 추가 (이전에 온도 선택한 아이템들)
        allAddedItems.push(...pendingAddedItems);

        // 3. 현재 온도 선택한 아이템 추가
        allAddedItems.push(newAddedItem);

        // 통합 메시지 생성
        const itemsStr = allAddedItems.map(item => {
          const tempKo = item.temperature === 'HOT' ? '따뜻한' : item.temperature === 'ICE' ? '아이스' : '';
          return tempKo ? `${tempKo} ${item.name} ${item.quantity}잔` : `${item.name} ${item.quantity}잔`;
        }).join(', ');
        response = `${itemsStr} 추가했습니다. 더 필요하신 게 있으신가요?`;
        setPendingAddedItems([]); // 초기화
        setPendingOrders([]); // 초기화
      }

      addAssistantResponse(response);
      speakRef.current(response);
    }
  }, [temperatureConflicts, pendingAddedItems, pendingOrders, addItem, addAssistantResponse, resetActivity, speakRef]);

  // 상태 초기화 (세션 종료 시 사용)
  const resetState = useCallback(() => {
    setVoiceState('idle');
    setTemperatureConflicts([]);
    setPendingOrders([]);
    setPendingAddedItems([]);
    interimMessageIdRef.current = null;
  }, []);

  return {
    voiceState,
    setVoiceState,
    temperatureConflicts,
    pendingAddedItems,
    handleSpeechResult,
    processMatchedOrders,
    handleVoiceTemperatureSelect,
    interimMessageIdRef,
    resetState,
  };
}
