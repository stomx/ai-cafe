/**
 * E2E 테스트 결과 검증 유틸리티
 */

import type { OrderIntent } from '@/lib/gemini/types';
import type { OrderItem } from '@/types/order';

export interface TestValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Intent 타입 검증
 */
export function validateIntentType(
  actual: string | undefined,
  expected: string
): { passed: boolean; message?: string } {
  if (!actual) {
    return { passed: false, message: 'Intent가 반환되지 않았습니다' };
  }

  // "ADD_ITEM or ASK_CLARIFICATION" 같은 경우 처리
  const expectedTypes = expected.split(' or ').map((t) => t.trim());

  if (expectedTypes.includes(actual)) {
    return { passed: true };
  }

  return {
    passed: false,
    message: `예상: ${expected}, 실제: ${actual}`,
  };
}

/**
 * 주문 목록에 특정 메뉴가 있는지 확인
 */
export function validateMenuInOrder(
  orderItems: OrderItem[],
  menuName: string,
  temperature?: 'HOT' | 'ICE' | null,
  quantity?: number
): { passed: boolean; message?: string } {
  const foundItems = orderItems.filter((item) => item.name.includes(menuName));

  if (foundItems.length === 0) {
    return { passed: false, message: `${menuName}이(가) 주문 목록에 없습니다` };
  }

  // 온도 확인
  if (temperature !== undefined && temperature !== null) {
    const withTemp = foundItems.find((item) => item.temperature === temperature);
    if (!withTemp) {
      return {
        passed: false,
        message: `${menuName}의 온도가 ${temperature}가 아닙니다`,
      };
    }
  }

  // 수량 확인
  if (quantity !== undefined) {
    const totalQuantity = foundItems.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQuantity !== quantity) {
      return {
        passed: false,
        message: `${menuName}의 수량이 ${quantity}잔이 아닙니다 (실제: ${totalQuantity}잔)`,
      };
    }
  }

  return { passed: true };
}

/**
 * 주문 목록이 비어있는지 확인
 */
export function validateEmptyOrder(orderItems: OrderItem[]): {
  passed: boolean;
  message?: string;
} {
  if (orderItems.length > 0) {
    return {
      passed: false,
      message: `주문 목록이 비어있어야 하는데 ${orderItems.length}개 항목이 있습니다`,
    };
  }
  return { passed: true };
}

/**
 * 주문 목록에서 특정 메뉴가 삭제되었는지 확인
 */
export function validateMenuRemoved(
  orderItems: OrderItem[],
  menuName: string
): { passed: boolean; message?: string } {
  const found = orderItems.find((item) => item.name.includes(menuName));
  if (found) {
    return { passed: false, message: `${menuName}이(가) 아직 주문 목록에 있습니다` };
  }
  return { passed: true };
}

/**
 * TTS 메시지에 특정 키워드가 포함되어 있는지 확인
 */
export function validateTTSMessage(
  message: string | undefined,
  keywords: string[]
): { passed: boolean; message?: string } {
  if (!message) {
    return { passed: false, message: 'TTS 메시지가 없습니다' };
  }

  const missingKeywords = keywords.filter((keyword) => !message.includes(keyword));

  if (missingKeywords.length > 0) {
    return {
      passed: false,
      message: `TTS 메시지에 다음 키워드가 없습니다: ${missingKeywords.join(', ')}`,
    };
  }

  return { passed: true };
}

/**
 * 시나리오별 검증 규칙
 */
export function validateScenario(
  scenarioId: number,
  intent: OrderIntent | null,
  orderItems: OrderItem[],
  ttsMessage: string | undefined
): TestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  switch (scenarioId) {
    case 1: {
      // "따뜻한 아메리카노 주세요" → HOT 아메리카노 1잔 추가
      const intentCheck = validateIntentType(intent?.type, 'ADD_ITEM');
      if (!intentCheck.passed) errors.push(intentCheck.message!);

      const orderCheck = validateMenuInOrder(orderItems, '아메리카노', 'HOT', 1);
      if (!orderCheck.passed) errors.push(orderCheck.message!);

      const ttsCheck = validateTTSMessage(ttsMessage, ['아메리카노', '추가']);
      if (!ttsCheck.passed) warnings.push(ttsCheck.message!);
      break;
    }

    case 2: {
      // "아이스 카페라떼 하나요" → ICE 카페라떼 1잔 추가
      const intentCheck = validateIntentType(intent?.type, 'ADD_ITEM');
      if (!intentCheck.passed) errors.push(intentCheck.message!);

      const orderCheck = validateMenuInOrder(orderItems, '카페라떼', 'ICE', 1);
      if (!orderCheck.passed) errors.push(orderCheck.message!);

      const ttsCheck = validateTTSMessage(ttsMessage, ['카페라떼', '추가']);
      if (!ttsCheck.passed) warnings.push(ttsCheck.message!);
      break;
    }

    case 3: {
      // "바닐라라떼 주세요" → 온도 선택 모달 표시
      const intentCheck = validateIntentType(intent?.type, 'ADD_ITEM or ASK_CLARIFICATION');
      if (!intentCheck.passed) errors.push(intentCheck.message!);

      const ttsCheck = validateTTSMessage(ttsMessage, ['바닐라라떼', '따뜻', '차갑']);
      if (!ttsCheck.passed) warnings.push(ttsCheck.message!);
      break;
    }

    case 4: {
      // "콜드브루 주세요" → ICE 콜드브루 1잔 추가 (단일 온도)
      const intentCheck = validateIntentType(intent?.type, 'ADD_ITEM');
      if (!intentCheck.passed) errors.push(intentCheck.message!);

      const orderCheck = validateMenuInOrder(orderItems, '콜드브루', 'ICE', 1);
      if (!orderCheck.passed) errors.push(orderCheck.message!);
      break;
    }

    case 5: {
      // "에스프레소 한 잔이요" → HOT 에스프레소 1잔 추가
      const intentCheck = validateIntentType(intent?.type, 'ADD_ITEM');
      if (!intentCheck.passed) errors.push(intentCheck.message!);

      const orderCheck = validateMenuInOrder(orderItems, '에스프레소', 'HOT', 1);
      if (!orderCheck.passed) errors.push(orderCheck.message!);
      break;
    }

    case 6: {
      // "아이스 아메리카노 세 잔 주세요" → ICE 아메리카노 3잔 추가
      const intentCheck = validateIntentType(intent?.type, 'ADD_ITEM');
      if (!intentCheck.passed) errors.push(intentCheck.message!);

      const orderCheck = validateMenuInOrder(orderItems, '아메리카노', 'ICE', 3);
      if (!orderCheck.passed) errors.push(orderCheck.message!);
      break;
    }

    case 10: {
      // 메뉴 삭제
      const intentCheck = validateIntentType(intent?.type, 'REMOVE_ITEM');
      if (!intentCheck.passed) errors.push(intentCheck.message!);

      const orderCheck = validateMenuRemoved(orderItems, '아메리카노');
      if (!orderCheck.passed) errors.push(orderCheck.message!);
      break;
    }

    case 16: {
      // 전체 주문 취소
      const intentCheck = validateIntentType(intent?.type, 'CLEAR_ORDER');
      if (!intentCheck.passed) errors.push(intentCheck.message!);

      const orderCheck = validateEmptyOrder(orderItems);
      if (!orderCheck.passed) errors.push(orderCheck.message!);
      break;
    }

    case 17: {
      // 주문 확정
      const intentCheck = validateIntentType(intent?.type, 'CONFIRM_ORDER');
      if (!intentCheck.passed) errors.push(intentCheck.message!);
      break;
    }

    case 18: {
      // "아이스 롯데 두 잔이요" → 카페라떼로 매칭
      const intentCheck = validateIntentType(intent?.type, 'ADD_ITEM');
      if (!intentCheck.passed) errors.push(intentCheck.message!);

      const orderCheck = validateMenuInOrder(orderItems, '카페라떼', 'ICE', 2);
      if (!orderCheck.passed) errors.push(orderCheck.message!);
      break;
    }

    case 19: {
      // "따뜻한 아매 하나요" → 아메리카노로 매칭
      const intentCheck = validateIntentType(intent?.type, 'ADD_ITEM');
      if (!intentCheck.passed) errors.push(intentCheck.message!);

      const orderCheck = validateMenuInOrder(orderItems, '아메리카노', 'HOT', 1);
      if (!orderCheck.passed) errors.push(orderCheck.message!);
      break;
    }

    case 20: {
      // "오늘 날씨 어때요?" → UNKNOWN
      const intentCheck = validateIntentType(intent?.type, 'UNKNOWN');
      if (!intentCheck.passed) errors.push(intentCheck.message!);
      break;
    }

    default:
      warnings.push('이 시나리오에 대한 검증 규칙이 아직 구현되지 않았습니다');
      break;
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
  };
}
