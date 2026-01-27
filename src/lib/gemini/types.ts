/**
 * Gemini LLM 의도(Intent) 타입 정의
 */

export type IntentType =
  | 'ADD_ITEM'           // 메뉴 추가
  | 'REMOVE_ITEM'        // 메뉴 제거
  | 'CHANGE_QUANTITY'    // 수량 변경
  | 'CHANGE_TEMPERATURE' // 온도 변경
  | 'MULTI_ACTION'       // 복합 명령 (여러 동작 혼합)
  | 'CLEAR_ORDER'        // 주문 초기화
  | 'CONFIRM_ORDER'      // 주문 확정
  | 'ASK_CLARIFICATION'  // 명확화 필요
  | 'UNKNOWN';           // 파악 불가

export type ItemAction = 'ADD' | 'REMOVE' | 'CHANGE_QUANTITY' | 'CHANGE_TEMPERATURE';

export interface OrderItemIntent {
  menuId: string;
  menuName: string;
  temperature?: 'HOT' | 'ICE' | null;  // null이면 명확화 필요
  quantity: number;
  action?: ItemAction;  // 복합 명령 시 각 아이템별 액션
}

export interface OrderIntent {
  type: IntentType;
  items?: OrderItemIntent[];  // ADD_ITEM, REMOVE_ITEM, CHANGE_* 시
  message?: string;           // ASK_CLARIFICATION 시 질문 메시지
  confidence: number;         // 0.0 ~ 1.0
}

// Gemini API 응답 형식
export interface GeminiOrderResponse {
  type: IntentType;
  items?: Array<{
    menuId: string;
    menuName: string;
    temperature?: 'HOT' | 'ICE' | null;
    quantity: number;
  }>;
  message?: string;
  confidence: number;
}
