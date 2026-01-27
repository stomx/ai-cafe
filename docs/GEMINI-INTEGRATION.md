# Gemini LLM 음성 주문 처리 통합

## 개요

이 문서는 AI Cafe 프로젝트에 Gemini LLM을 통합하여 음성 주문을 처리하는 시스템의 구현 내용을 설명합니다.

### 목표

- STT로 입력된 음성을 Gemini LLM을 통해 **의도(Intent)**를 파악
- 해당 의도에 맞는 **CTA(Call To Action)**를 트리거
- 터치/클릭과 **동일한 동작 및 메시지** 제공

### 핵심 설계 원칙

```
음성 = 터치 = 동일 동작
```

- 음성 주문과 터치 주문이 **동일한 CTA 함수** 호출
- **동일한 피드백 메시지** (TTS 포함)
- 코드 중복 제거, UX 일관성 유지

---

## 아키텍처

### 데이터 흐름

```
┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│ 사용자 음성  │ ──▶ │ STT (Web    │ ──▶ │ useVoiceOrder    │
│             │     │ Speech API) │     │ Processor        │
└─────────────┘     └─────────────┘     └────────┬─────────┘
                                                  │
                           ┌──────────────────────┼──────────────────────┐
                           │                      │                      │
                           ▼                      ▼                      ▼
                    ┌─────────────┐       ┌─────────────┐       ┌─────────────┐
                    │ Gemini API  │       │ 폴백:       │       │ 온도 충돌   │
                    │ Route       │       │ menuMatcher │       │ 처리        │
                    └──────┬──────┘       └──────┬──────┘       └──────┬──────┘
                           │                      │                      │
                           └──────────────────────┼──────────────────────┘
                                                  │
                                                  ▼
                                        ┌─────────────────┐
                                        │ useOrderActions │
                                        │ (CTA 핸들러)    │
                                        └────────┬────────┘
                                                 │
                    ┌────────────────────────────┼────────────────────────────┐
                    │                            │                            │
                    ▼                            ▼                            ▼
            ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
            │ orderStore  │             │ chatStore   │             │ queueStore  │
            │ (주문 상태) │             │ (메시지)    │             │ (대기열)    │
            └─────────────┘             └─────────────┘             └─────────────┘
                                                 │
                                                 ▼
                                        ┌─────────────────┐
                                        │ TTS 재생       │
                                        │ + UI 업데이트   │
                                        └─────────────────┘
```

### 터치와 음성의 동일 경로

```
[터치/클릭] ─────────────────────────┐
                                     │
[음성] → [STT] → [Gemini/폴백] ──────┤
                                     │
                                     ▼
                           ┌─────────────────┐
                           │ useOrderActions │
                           │ (동일한 CTA)    │
                           └─────────────────┘
                                     │
                                     ▼
                           ┌─────────────────┐
                           │ 동일한 응답     │
                           │ (TTS + UI)      │
                           └─────────────────┘
```

---

## 파일 구조

### 신규 생성 파일

```
src/
├── lib/
│   └── gemini/
│       ├── index.ts          # Export 정리
│       ├── types.ts          # Intent 타입 정의
│       ├── prompts.ts        # 시스템 프롬프트 및 컨텍스트 생성
│       └── client.ts         # API 클라이언트
├── app/
│   └── api/
│       └── gemini/
│           └── route.ts      # Gemini API 서버 라우트
└── hooks/
    ├── useOrderActions.ts    # CTA 핸들러 통합
    └── useGeminiOrder.ts     # Intent→CTA 연결
```

### 수정 파일

```
src/
├── hooks/
│   └── useVoiceOrderProcessor.ts  # Gemini 통합
└── app/
    └── page.tsx                   # useGemini 옵션 추가
```

---

## 타입 정의

### Intent 타입 (`src/lib/gemini/types.ts`)

```typescript
type IntentType =
  | 'ADD_ITEM'           // 메뉴 추가
  | 'REMOVE_ITEM'        // 메뉴 제거
  | 'CHANGE_QUANTITY'    // 수량 변경
  | 'CHANGE_TEMPERATURE' // 온도 변경
  | 'CLEAR_ORDER'        // 주문 초기화
  | 'CONFIRM_ORDER'      // 주문 확정
  | 'ASK_CLARIFICATION'  // 명확화 필요
  | 'UNKNOWN';           // 파악 불가

interface OrderIntent {
  type: IntentType;
  items?: OrderItemIntent[];  // 메뉴 정보
  message?: string;           // 명확화 질문 메시지
  confidence: number;         // 0.0 ~ 1.0
}

interface OrderItemIntent {
  menuId: string;
  menuName: string;
  temperature?: 'HOT' | 'ICE' | null;
  quantity: number;
}
```

### 의도 분류 예시

| 사용자 발화 | Intent Type | 설명 |
|------------|-------------|------|
| "아이스 아메리카노 주세요" | `ADD_ITEM` | 메뉴 추가 |
| "라떼 두 잔이요" | `ADD_ITEM` | 수량 포함 |
| "라떼 주세요" | `ASK_CLARIFICATION` | 온도 미지정 |
| "아메리카노 빼주세요" | `REMOVE_ITEM` | 메뉴 제거 |
| "아메리카노 3잔으로" | `CHANGE_QUANTITY` | 수량 변경 |
| "아메리카노 아이스로 바꿔주세요" | `CHANGE_TEMPERATURE` | 온도 변경 |
| "전부 취소해주세요" | `CLEAR_ORDER` | 전체 취소 |
| "주문할게요" | `CONFIRM_ORDER` | 주문 확정 |
| "오늘 날씨 어때?" | `UNKNOWN` | 주문 무관 |

---

## 핵심 컴포넌트

### 1. API 라우트 (`src/app/api/gemini/route.ts`)

서버 측에서 Gemini API를 호출하여 API 키를 보호합니다.

```typescript
// POST /api/gemini
// Request Body:
{
  transcript: string;           // 사용자 음성 텍스트
  currentItems?: Array<{        // 현재 주문 목록 (컨텍스트)
    name: string;
    temperature: string | null;
    quantity: number;
  }>;
  pendingClarification?: {      // 대기 중인 질문
    menuName: string;
    question: string;
  };
}

// Response:
{
  type: IntentType;
  items?: OrderItemIntent[];
  message?: string;
  confidence: number;
}
```

**주요 기능:**
- 5초 타임아웃 설정
- JSON 응답 포맷 강제 (`responseMimeType: 'application/json'`)
- 낮은 temperature (0.1)로 일관된 응답

### 2. CTA 핸들러 (`src/hooks/useOrderActions.ts`)

음성과 터치가 공유하는 통합 주문 액션 핸들러입니다.

```typescript
interface OrderActions {
  handleAddItem: (menuId: string, temperature: Temperature | null, quantity?: number) => OrderActionResult;
  handleRemoveItem: (menuId: string) => OrderActionResult;
  handleChangeQuantity: (menuId: string, quantity: number) => OrderActionResult;
  handleChangeTemperature: (menuId: string, temperature: Temperature) => OrderActionResult;
  handleClearOrder: () => OrderActionResult;
  handleConfirmOrder: () => OrderActionResult;
  getMenuItem: (menuId: string) => MenuItem | undefined;
}

interface OrderActionResult {
  success: boolean;
  message: string;                    // TTS로 재생할 메시지
  needsClarification?: boolean;       // 추가 정보 필요 여부
  clarificationData?: {               // 명확화 데이터
    menuItem: MenuItem;
    quantity: number;
  };
}
```

**사용 예시:**
```typescript
// 음성에서 사용
const result = actions.handleAddItem('americano', 'ICE', 2);
// result.message: "아메리카노 ICE 2잔 추가했습니다."

// 터치에서도 동일하게 사용
const result = actions.handleAddItem('cafe-latte', 'HOT', 1);
// result.message: "카페라떼 HOT 1잔 추가했습니다."
```

### 3. Gemini 처리 훅 (`src/hooks/useGeminiOrder.ts`)

Gemini를 통한 의도 분석 및 CTA 실행을 담당합니다.

```typescript
function useGeminiOrder({
  actions: OrderActions;
  enabled?: boolean;  // Gemini 사용 여부 (기본: true)
}): {
  processVoiceInput: (transcript: string) => Promise<ProcessResult>;
  isGeminiAvailable: boolean;
}
```

**처리 흐름:**

```typescript
async function processVoiceInput(transcript: string) {
  // 1. Gemini로 의도 분석
  const intent = await analyzeIntent(transcript, { currentItems });

  // 2. confidence 체크 (0.5 미만이면 폴백)
  if (intent.confidence < 0.5) {
    return fallbackToMenuMatcher(transcript);
  }

  // 3. Intent에 따른 CTA 실행
  return executeIntent(intent);
}
```

### 4. 음성 처리 통합 (`src/hooks/useVoiceOrderProcessor.ts`)

기존 음성 처리 로직에 Gemini를 통합합니다.

**변경점:**
- `useGemini` 옵션 추가 (기본값: `true`)
- Gemini 처리 로직 추가 (비동기)
- 폴백 함수 분리 (`fallbackToMenuMatcher`)

```typescript
function useVoiceOrderProcessor({
  speakRef,
  resetActivity,
  useGemini = true,      // 신규 옵션
  onOrderConfirmed,      // 신규 옵션
}): UseVoiceOrderProcessorReturn
```

---

## 프롬프트 설계 (`src/lib/gemini/prompts.ts`)

### 시스템 프롬프트 구조

```
1. 역할 정의: 카페 키오스크 AI
2. 메뉴 목록: ID, 이름, 온도 옵션, 가격
3. 응답 포맷: JSON 스키마
4. 의도 분류 규칙: 8가지 IntentType별 예시
5. 온도 처리 규칙
6. 수량 처리 규칙
7. 메뉴 매칭 규칙
```

### 메뉴 목록 포맷

```
- ID: americano, 이름: 아메리카노, 영문: Americano, 온도: HOT/ICE, 가격: 4500원
- ID: cafe-latte, 이름: 카페라떼, 영문: Cafe Latte, 온도: HOT/ICE, 가격: 5000원
- ID: cold-brew, 이름: 콜드브루, 영문: Cold Brew, 온도: ICE, 가격: 5000원
...
```

### 컨텍스트 전달

현재 주문 상태를 프롬프트에 포함하여 문맥 인식 향상:

```typescript
getOrderContext([
  { name: '아메리카노', temperature: 'ICE', quantity: 2 },
  { name: '카페라떼', temperature: 'HOT', quantity: 1 },
])

// 출력:
// 현재 주문 목록:
// - 아메리카노 (ICE) 2잔
// - 카페라떼 (HOT) 1잔
```

---

## 폴백 전략

### 폴백 트리거 조건

1. **API 에러**: 네트워크 오류, 5xx 응답
2. **타임아웃**: 5초 초과
3. **낮은 Confidence**: 0.5 미만
4. **파싱 에러**: JSON 파싱 실패

### 폴백 로깅

모든 폴백 케이스는 콘솔에 로깅됩니다:

```typescript
console.warn('[Gemini Fallback]', {
  reason: error?.message || 'Unknown error',
  timestamp: new Date().toISOString(),
  transcript,
});
```

**로그 예시:**
```
[Gemini Fallback] { reason: 'API error: 500', timestamp: '2024-01-15T10:30:00.000Z', transcript: '아이스 아메리카노' }
[Gemini Fallback] { reason: 'Gemini API timeout', timestamp: '...', transcript: '...' }
[Gemini Fallback] { reason: 'Low confidence: 0.3', timestamp: '...', transcript: '...' }
```

### 폴백 처리

기존 `menuMatcher`를 사용하여 규칙 기반 처리:

```typescript
const fallbackToMenuMatcher = (transcript, error) => {
  // 로깅
  console.warn('[Gemini Fallback]', { reason, timestamp, transcript });

  // 기존 menuMatcher로 처리
  const matchResult = matchVoiceToMenu(transcript);

  // CTA 트리거
  for (const order of matchResult.orders) {
    actions.handleAddItem(order.menuItem.id, order.temperature, order.quantity);
  }

  return { success: true, fallback: true };
};
```

---

## 환경 설정

### 환경 변수

```bash
# .env.local
GEMINI_API_KEY=your-api-key-here
```

**주의:** `NEXT_PUBLIC_` 접두사를 사용하지 않습니다. API 키는 서버 측에서만 접근합니다.

### 사용 설정

```typescript
// page.tsx
const { ... } = useVoiceOrderProcessor({
  speakRef,
  resetActivity,
  useGemini: true,  // Gemini 사용 (기본값)
  // useGemini: false, // 기존 menuMatcher만 사용
});
```

---

## 테스트 시나리오

### 1. 음성 주문 테스트

| 테스트 케이스 | 입력 | 예상 결과 |
|--------------|------|----------|
| 단일 메뉴 | "아이스 아메리카노 주세요" | 아메리카노 ICE 1잔 추가 |
| 복수 메뉴 | "아메리카노 두 잔이요" | 아메리카노 2잔 추가 |
| 온도 미지정 | "라떼 주세요" | "따뜻하게 드릴까요, 차갑게 드릴까요?" |
| 온도 변경 | "아메리카노 핫으로 바꿔주세요" | "아메리카노 핫으로 변경했습니다." |
| 주문 확정 | "주문할게요" | 주문 완료, 대기열 추가 |

### 2. 터치 연동 테스트

| 테스트 케이스 | 예상 결과 |
|--------------|----------|
| ICE 버튼 클릭 | 음성 주문과 동일한 TTS 메시지 |
| 수량 변경 | 음성 수량 변경과 동일한 응답 |

### 3. 폴백 테스트

| 테스트 케이스 | 방법 | 예상 결과 |
|--------------|------|----------|
| API 에러 | API 키 제거 | 콘솔 로그 + menuMatcher 처리 |
| 타임아웃 | 네트워크 지연 시뮬레이션 | 콘솔 로그 + menuMatcher 처리 |

---

## 성능 고려사항

### 응답 시간

- **Gemini API**: 평균 1-2초
- **폴백 (menuMatcher)**: < 10ms
- **서버 타임아웃**: 5초 (`route.ts`)
- **클라이언트 타임아웃**: 6초 (`client.ts`, 서버 5초 + 여유 1초)

### 최적화

1. **낮은 Temperature (0.1)**: 일관된 응답을 위해
2. **JSON 응답 포맷 강제**: 파싱 오류 최소화
3. **컨텍스트 최소화**: 필요한 정보만 전달
4. **짧은 타임아웃**: UX를 위한 빠른 폴백

---

## 향후 개선 사항

1. **대화 히스토리**: 이전 대화 맥락 유지
2. **메뉴 추천**: 인기 메뉴, 계절 메뉴 추천
3. **에러 분석**: 폴백 원인 분석 대시보드
4. **A/B 테스트**: Gemini vs menuMatcher 성능 비교
5. **다국어 지원**: 영어, 중국어 등

---

## 관련 파일 참조

- [기술 스택](./TECH-STACK.md)
- [UI 디자인](./UI-DESIGN.md)
- [메뉴 매처 유틸리티](../src/utils/menuMatcher.ts)
