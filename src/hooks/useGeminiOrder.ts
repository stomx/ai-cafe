'use client';

import { useCallback, useRef } from 'react';
import { analyzeIntent, isGeminiConfigured } from '@/lib/gemini';
import type { OrderIntent } from '@/lib/gemini/types';
import { matchVoiceToMenu, type MatchedOrder } from '@/utils/menuMatcher';
import type { OrderActions } from './useOrderActions';
import { useOrderStore } from '@/store/orderStore';

interface ProcessResult {
  success: boolean;
  message: string;
  needsClarification?: boolean;
  clarificationData?: {
    menuName: string;
    question: string;
  };
  temperatureConflicts?: MatchedOrder[];
  fallback?: boolean;
}

interface UseGeminiOrderOptions {
  actions: OrderActions;
  enabled?: boolean;
}

interface UseGeminiOrderReturn {
  processVoiceInput: (transcript: string) => Promise<ProcessResult>;
  isGeminiAvailable: boolean;
}

export function useGeminiOrder({
  actions,
  enabled = true,
}: UseGeminiOrderOptions): UseGeminiOrderReturn {
  const items = useOrderStore((state) => state.items);
  const isProcessingRef = useRef(false);

  const isGeminiAvailable = enabled && isGeminiConfigured();

  /**
   * Gemini 폴백: 기존 menuMatcher 사용
   */
  const fallbackToMenuMatcher = useCallback((
    transcript: string,
    error?: Error
  ): ProcessResult => {
    console.warn('[Gemini Fallback]', {
      reason: error?.message || 'Unknown error',
      timestamp: new Date().toISOString(),
      transcript,
    });

    // 기존 menuMatcher로 처리
    const matchResult = matchVoiceToMenu(transcript);

    if (matchResult.orders.length === 0 && matchResult.temperatureConflicts.length === 0) {
      return {
        success: false,
        message: '주문 내용을 이해하지 못했습니다. 다시 말씀해주세요.',
        fallback: true,
      };
    }

    // 온도 충돌이 있는 경우
    if (matchResult.temperatureConflicts.length > 0) {
      return {
        success: true,
        message: '',
        temperatureConflicts: matchResult.temperatureConflicts,
        fallback: true,
      };
    }

    // 주문 처리
    const addedItems: string[] = []; // 추가된 아이템 정보 (통합 메시지용)
    const conflicts: MatchedOrder[] = [];

    for (const order of matchResult.orders) {
      const result = actions.handleAddItem(
        order.menuItem.id,
        order.temperature,
        order.quantity
      );

      if (result.needsClarification && result.clarificationData) {
        conflicts.push({
          menuItem: result.clarificationData.menuItem,
          quantity: result.clarificationData.quantity,
          temperature: null,
        });
      } else if (result.success) {
        // 통합 메시지용: "메뉴명 N잔" 형식으로 수집
        addedItems.push(`${order.menuItem.name} ${order.quantity}잔`);
      }
    }

    // 통합 메시지 생성: "에스프레소 3잔 콜드브루 2잔 추가했습니다."
    const addedMessage = addedItems.length > 0
      ? `${addedItems.join(' ')} 추가했습니다.`
      : '';

    if (conflicts.length > 0) {
      return {
        success: true,
        message: addedMessage,
        temperatureConflicts: conflicts,
        fallback: true,
      };
    }

    return {
      success: true,
      message: addedMessage,
      fallback: true,
    };
  }, [actions]);

  /**
   * Intent에 따른 CTA 실행
   */
  const executeIntent = useCallback((intent: OrderIntent): ProcessResult => {
    switch (intent.type) {
      case 'ADD_ITEM': {
        if (!intent.items || intent.items.length === 0) {
          return { success: false, message: '추가할 메뉴가 없습니다.' };
        }

        const addedItems: string[] = []; // 추가된 아이템 정보 (통합 메시지용)
        const conflicts: MatchedOrder[] = [];

        for (const item of intent.items) {
          // temperature가 null이고 명확화가 필요한 경우
          if (item.temperature === null) {
            const menuItem = actions.getMenuItem(item.menuId);
            if (menuItem && menuItem.temperatures.length > 1) {
              conflicts.push({
                menuItem,
                quantity: item.quantity,
                temperature: null,
              });
              continue;
            }
          }

          const result = actions.handleAddItem(
            item.menuId,
            item.temperature ?? null,
            item.quantity
          );

          if (result.needsClarification && result.clarificationData) {
            conflicts.push({
              menuItem: result.clarificationData.menuItem,
              quantity: result.clarificationData.quantity,
              temperature: null,
            });
          } else if (result.success) {
            // 통합 메시지용: "메뉴명 N잔" 형식으로 수집
            const menuItem = actions.getMenuItem(item.menuId);
            if (menuItem) {
              addedItems.push(`${menuItem.name} ${item.quantity}잔`);
            }
          }
        }

        // 통합 메시지 생성: "에스프레소 3잔 콜드브루 2잔 추가했습니다."
        const addedMessage = addedItems.length > 0
          ? `${addedItems.join(' ')} 추가했습니다.`
          : '';

        if (conflicts.length > 0) {
          const firstConflict = conflicts[0];
          return {
            success: true,
            message: addedMessage,
            temperatureConflicts: conflicts,
            needsClarification: true,
            clarificationData: {
              menuName: firstConflict.menuItem.name,
              question: `${firstConflict.menuItem.name} 따뜻하게 드릴까요, 차갑게 드릴까요?`,
            },
          };
        }

        return {
          success: true,
          message: addedMessage || '메뉴를 추가했습니다.',
        };
      }

      case 'REMOVE_ITEM': {
        if (!intent.items || intent.items.length === 0) {
          return { success: false, message: '삭제할 메뉴를 찾을 수 없습니다.' };
        }

        const messages: string[] = [];
        for (const item of intent.items) {
          const result = actions.handleRemoveItem(item.menuId);
          if (result.success) {
            messages.push(result.message);
          }
        }

        return {
          success: messages.length > 0,
          message: messages.join(' ') || '삭제할 메뉴를 찾을 수 없습니다.',
        };
      }

      case 'CHANGE_QUANTITY': {
        if (!intent.items || intent.items.length === 0) {
          return { success: false, message: '변경할 메뉴를 찾을 수 없습니다.' };
        }

        const messages: string[] = [];
        for (const item of intent.items) {
          const result = actions.handleChangeQuantity(item.menuId, item.quantity);
          if (result.success) {
            messages.push(result.message);
          }
        }

        return {
          success: messages.length > 0,
          message: messages.join(' ') || '변경할 메뉴를 찾을 수 없습니다.',
        };
      }

      case 'CHANGE_TEMPERATURE': {
        if (!intent.items || intent.items.length === 0) {
          return { success: false, message: '온도를 변경할 메뉴를 찾을 수 없습니다.' };
        }

        const messages: string[] = [];
        for (const item of intent.items) {
          if (!item.temperature) {
            continue; // 온도가 지정되지 않은 경우 스킵
          }
          const result = actions.handleChangeTemperature(item.menuId, item.temperature);
          if (result.success) {
            messages.push(result.message);
          }
        }

        return {
          success: messages.length > 0,
          message: messages.join(' ') || '온도를 변경할 메뉴를 찾을 수 없습니다.',
        };
      }

      case 'MULTI_ACTION': {
        if (!intent.items || intent.items.length === 0) {
          return { success: false, message: '처리할 항목이 없습니다.' };
        }

        const messages: string[] = [];
        const addedItems: string[] = [];
        const conflicts: MatchedOrder[] = [];

        for (const item of intent.items) {
          switch (item.action) {
            case 'ADD': {
              // temperature가 null이고 명확화가 필요한 경우
              if (item.temperature === null) {
                const menuItem = actions.getMenuItem(item.menuId);
                if (menuItem && menuItem.temperatures.length > 1) {
                  conflicts.push({
                    menuItem,
                    quantity: item.quantity,
                    temperature: null,
                  });
                  continue;
                }
              }

              const result = actions.handleAddItem(
                item.menuId,
                item.temperature ?? null,
                item.quantity
              );

              if (result.needsClarification && result.clarificationData) {
                conflicts.push({
                  menuItem: result.clarificationData.menuItem,
                  quantity: result.clarificationData.quantity,
                  temperature: null,
                });
              } else if (result.success) {
                const menuItem = actions.getMenuItem(item.menuId);
                if (menuItem) {
                  addedItems.push(`${menuItem.name} ${item.quantity}잔`);
                }
              }
              break;
            }

            case 'REMOVE': {
              const result = actions.handleRemoveItem(item.menuId);
              if (result.success) {
                messages.push(result.message);
              }
              break;
            }

            case 'CHANGE_QUANTITY': {
              const result = actions.handleChangeQuantity(item.menuId, item.quantity);
              if (result.success) {
                messages.push(result.message);
              }
              break;
            }

            case 'CHANGE_TEMPERATURE': {
              if (!item.temperature) {
                continue;
              }
              const result = actions.handleChangeTemperature(item.menuId, item.temperature);
              if (result.success) {
                messages.push(result.message);
              }
              break;
            }

            default:
              console.warn('[MULTI_ACTION] Unknown action:', item.action);
              break;
          }
        }

        // 통합 메시지 생성
        if (addedItems.length > 0) {
          messages.push(`${addedItems.join(' ')} 추가했습니다.`);
        }

        if (conflicts.length > 0) {
          const firstConflict = conflicts[0];
          return {
            success: true,
            message: messages.join(' '),
            temperatureConflicts: conflicts,
            needsClarification: true,
            clarificationData: {
              menuName: firstConflict.menuItem.name,
              question: `${firstConflict.menuItem.name} 따뜻하게 드릴까요, 차갑게 드릴까요?`,
            },
          };
        }

        return {
          success: messages.length > 0,
          message: messages.join(' ') || '요청을 처리했습니다.',
        };
      }

      case 'CLEAR_ORDER': {
        const result = actions.handleClearOrder();
        return {
          success: result.success,
          message: result.message,
        };
      }

      case 'CONFIRM_ORDER': {
        const result = actions.handleConfirmOrder();
        return {
          success: result.success,
          message: result.message,
        };
      }

      case 'ASK_CLARIFICATION': {
        return {
          success: true,
          needsClarification: true,
          message: intent.message || '다시 한번 말씀해주시겠어요?',
          clarificationData: intent.items?.[0] ? {
            menuName: intent.items[0].menuName,
            question: intent.message || `${intent.items[0].menuName} 따뜻하게 드릴까요, 차갑게 드릴까요?`,
          } : undefined,
        };
      }

      case 'UNKNOWN':
      default: {
        return {
          success: false,
          message: '저는 주문과 관련된 대화만 가능합니다. 주문과 관련된 말씀 부탁드립니다.',
        };
      }
    }
  }, [actions]);

  /**
   * 음성 입력 처리 메인 함수
   */
  const processVoiceInput = useCallback(async (transcript: string): Promise<ProcessResult> => {
    // 중복 처리 방지
    if (isProcessingRef.current) {
      return { success: false, message: '처리 중입니다.' };
    }

    isProcessingRef.current = true;

    try {
      // Gemini가 비활성화된 경우 폴백
      if (!isGeminiAvailable) {
        console.log('[Gemini] Not available, using fallback');
        return fallbackToMenuMatcher(transcript);
      }

      // 현재 주문 상태를 컨텍스트로 전달
      const currentItems = items.map((item) => ({
        name: item.name,
        temperature: item.temperature,
        quantity: item.quantity,
      }));

      // Gemini로 의도 분석 (API 라우트 사용)
      const intent = await analyzeIntent(transcript, {
        currentItems,
      });

      console.log('[Gemini] Intent analyzed:', intent);
      if (intent.items && intent.items.length > 0) {
        console.log('[Gemini] Items with quantities:', intent.items.map(item =>
          `${item.menuName}(${item.menuId}) qty=${item.quantity} temp=${item.temperature}`
        ).join(', '));
      }

      // confidence가 낮으면 폴백
      if (intent.confidence < 0.5) {
        console.log('[Gemini] Low confidence, using fallback');
        return fallbackToMenuMatcher(transcript, new Error(`Low confidence: ${intent.confidence}`));
      }

      // CONFIRM_ORDER 안전장치: 메뉴 아이템이 포함되어 있으면 ADD_ITEM으로 재분류
      if (intent.type === 'CONFIRM_ORDER' && intent.items && intent.items.length > 0) {
        console.log('[Gemini] CONFIRM_ORDER with items detected, reclassifying to ADD_ITEM:', intent.items);
        intent.type = 'ADD_ITEM';
      }

      // 의도에 따른 CTA 실행
      return executeIntent(intent);
    } catch (error) {
      // 에러 시 폴백
      const err = error instanceof Error ? error : new Error('Unknown error');
      console.error('[Gemini] Error:', err.message);
      return fallbackToMenuMatcher(transcript, err);
    } finally {
      isProcessingRef.current = false;
    }
  }, [isGeminiAvailable, items, fallbackToMenuMatcher, executeIntent]);

  return {
    processVoiceInput,
    isGeminiAvailable,
  };
}
