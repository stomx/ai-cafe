# AI Cafe - 코드 품질 분석 및 리팩터링 계획

## 1. 분석 요약

### 1.1 분석 범위
- **Vercel React Best Practices** (45개 규칙)
- **SOLID 원칙** (객체지향 설계 원칙)

### 1.2 종합 점수

| 영역 | 점수 | 평가 |
|------|------|------|
| Vercel Best Practices | **A-** | 우수 (성능 패턴 잘 적용) |
| SOLID 원칙 | **C** | 개선 필요 (구조적 문제) |

---

## 2. Vercel Best Practices 분석

### 2.1 이미 최적화된 영역 (유지)

| 패턴 | 파일 | 설명 |
|------|------|------|
| Stale Closure 방지 | `useSpeechToText.ts`, `useSessionTimer.ts` | Ref 기반 콜백 패턴 |
| TTS 동시 호출 방지 | `supertonic.ts` | `_isSpeaking` 플래그 + Mutex |
| Promise 캐싱 | `loading-manager.ts` | 중복 AI 모델 로딩 방지 |
| Zustand 셀렉터 | 전체 | 개별 속성 구독 |
| 스크립트 지연 | `layout.tsx` | `afterInteractive` 전략 |

### 2.2 개선 가능 영역 (선택적)

| 항목 | 현황 | 권장 |
|------|------|------|
| Barrel Imports | 10개 index.ts 사용 | `optimizePackageImports` 설정 |
| Dynamic Imports | 미사용 | 모달 컴포넌트 lazy loading |
| 병렬 로딩 | 일부 순차 | `Promise.all` 확대 |

---

## 3. SOLID 원칙 분석

### 3.1 원칙별 점수

| 원칙 | 점수 | 주요 문제 |
|------|------|----------|
| **S** (단일 책임) | 2/10 | page.tsx 845줄, 7개 책임 |
| **O** (개방-폐쇄) | 3/10 | Intent 추가 시 4개+ 파일 수정 |
| **L** (리스코프 치환) | 8/10 | 양호 |
| **I** (인터페이스 분리) | 7/10 | 양호 |
| **D** (의존성 역전) | 2/10 | 구체 모듈 직접 의존 |

### 3.2 주요 위배 사항

#### S 원칙 위배 - page.tsx (845줄)

담당 책임 7개:
1. 상태 관리 (12개 state/ref)
2. 세션 타이머 로직
3. 음성 처리 (STT/TTS) 조율
4. 메뉴 변경 감지 및 알림
5. 터치/음성 입력 통합
6. 얼굴 인식 콜백 처리
7. UI 렌더링 (모달 포함)

#### O 원칙 위배 - Intent 처리

```typescript
// useGeminiOrder.ts (라인 122-392)
switch (intent.type) {
  case 'ADD_ITEM': { ... }      // 67줄
  case 'REMOVE_ITEM': { ... }   // 17줄
  case 'CHANGE_QUANTITY': { ... }
  // ... 8개 case
}
```

새 Intent 추가 시 수정 필요 파일:
- `src/lib/gemini/types.ts`
- `src/hooks/useGeminiOrder.ts`
- `src/hooks/useVoiceOrderProcessor.ts`
- `src/app/api/gemini/route.ts`

#### D 원칙 위배 - 직접 의존성

```typescript
// page.tsx
import { useOrderStore } from '@/store/orderStore';
import { useQueueStore } from '@/store/queueStore';
import { useChatStore } from '@/store/chatStore';
```

문제점:
- 스토어 구조 변경 시 10개+ 파일 수정 필요
- TTS/STT 엔진 교체 불가능

---

## 4. 리팩터링 계획

### 주요 목표
1. **S (단일 책임)**: page.tsx 845줄 → 여러 컴포넌트/훅으로 분해
2. **O (개방-폐쇄)**: Intent 핸들러 패턴 도입 (switch문 제거)
3. **D (의존성 역전)**: 인터페이스 기반 설계로 전환

---

## Phase 1: page.tsx 분해 (S 원칙)

### 1.1 유틸리티 함수 분리

**새 파일**: `src/utils/koreanNumber.ts`

```typescript
// page.tsx에서 추출
export function numberToKoreanDigits(num: number): string;
export function numberToKoreanPrice(num: number): string;
```

**영향 파일**: `src/app/page.tsx` (라인 24-75 제거)

### 1.2 모달 컴포넌트 분리

**새 파일들**:
- `src/components/modals/TemperatureModal.tsx`
- `src/components/modals/OrderConfirmModal.tsx`
- `src/components/modals/VoiceTemperatureSelect.tsx`
- `src/components/modals/index.ts`

**page.tsx에서 추출할 부분**:
- 온도 선택 모달 JSX (라인 712-745)
- 주문 확인 모달 JSX (라인 748-798)
- 음성 온도 선택 JSX (라인 801-841)

### 1.3 세션 로직 분리

**새 파일**: `src/hooks/useKioskSession.ts`

세션 관련 로직 통합:
- 타이머 경고 메시지 (10초 남음)
- 마이크 타임아웃 처리 (15초)
- 스플래시 복귀 로직

**page.tsx에서 추출할 부분**:
- `hasShownMicTimeoutRef` 관련 로직
- `hasShownSessionWarningRef` 관련 로직
- 세션 타이머 useEffect

### 1.4 페이스 인식 로직 분리

**새 파일**: `src/hooks/useFaceDetectionHandler.ts`

얼굴 인식 콜백 및 자동 시작 로직:
- `hasAutoStartedRef` 관리
- `handleFaceDetected` 콜백
- 웰컴 메시지 TTS

---

## Phase 2: Intent 핸들러 패턴 (O 원칙)

### 2.1 핸들러 인터페이스 정의

**새 파일**: `src/lib/intent/types.ts`

```typescript
export interface IntentHandler {
  execute(intent: OrderIntent, actions: OrderActions): ProcessResult;
}

export interface IntentHandlerRegistry {
  register(type: IntentType, handler: IntentHandler): void;
  get(type: IntentType): IntentHandler | undefined;
  execute(intent: OrderIntent, actions: OrderActions): ProcessResult;
}
```

### 2.2 개별 핸들러 구현

**새 파일들** (`src/lib/intent/handlers/`):
- `AddItemHandler.ts`
- `RemoveItemHandler.ts`
- `ChangeQuantityHandler.ts`
- `ChangeTemperatureHandler.ts`
- `MultiActionHandler.ts`
- `ClearOrderHandler.ts`
- `ConfirmOrderHandler.ts`
- `ClarificationHandler.ts`
- `UnknownHandler.ts`
- `index.ts` (registry 생성)

### 2.3 useGeminiOrder 리팩터링

**수정 파일**: `src/hooks/useGeminiOrder.ts`

**Before** (라인 122-392):
```typescript
const executeIntent = useCallback((intent: OrderIntent): ProcessResult => {
  switch (intent.type) {
    case 'ADD_ITEM': { ... }  // 67줄
    case 'REMOVE_ITEM': { ... }
    // ... 8개 case
  }
}, [actions]);
```

**After**:
```typescript
import { createIntentRegistry } from '@/lib/intent';

const registry = createIntentRegistry();

const executeIntent = useCallback((intent: OrderIntent): ProcessResult => {
  return registry.execute(intent, actions);
}, [actions]);
```

---

## Phase 3: 의존성 역전 (D 원칙)

### 3.1 TTS Provider 인터페이스

**새 파일**: `src/lib/speech/types.ts`

```typescript
export interface TTSProvider {
  speak(text: string, options?: SpeakOptions): Promise<void>;
  stop(): void;
  isLoaded(): boolean;
  getEngineName(): string;
}

export interface STTProvider {
  startListening(): void;
  stopListening(): void;
  isListening(): boolean;
  onResult(callback: (text: string, isFinal: boolean) => void): void;
  onError(callback: (error: Error) => void): void;
}
```

### 3.2 Provider 구현체

**새 파일들** (`src/lib/speech/providers/`):
- `SupertonicTTSProvider.ts` - 기존 Supertonic 래핑
- `WebSpeechTTSProvider.ts` - Web Speech API 래핑
- `WebSpeechSTTProvider.ts` - 기존 STT 래핑

### 3.3 훅 리팩터링

**수정 파일**: `src/hooks/useTextToSpeech.ts`

```typescript
// Before: 직접 SupertonicTTS 사용
import { SupertonicTTS } from '@/lib/tts';

// After: Provider 인터페이스 사용
import type { TTSProvider } from '@/lib/speech/types';
import { createTTSProvider } from '@/lib/speech';

export function useTextToSpeech(provider?: TTSProvider) {
  const tts = provider ?? createTTSProvider();
  // ...
}
```

### 3.4 스토어 접근 추상화

**새 파일**: `src/contexts/StoreContext.tsx`

```typescript
interface StoreContextValue {
  order: Pick<OrderStore, 'items' | 'addItem' | 'removeItem' | 'clearOrder'>;
  queue: Pick<QueueStore, 'addToQueue' | 'preparingQueue' | 'readyQueue'>;
  chat: Pick<ChatStore, 'addMessage' | 'messages'>;
}

export const StoreContext = createContext<StoreContextValue | null>(null);
export const useStores = () => useContext(StoreContext);
```

---

## Phase 4: useVoiceOrderProcessor 분해

### 4.1 책임 분리

**새 파일들**:
- `src/hooks/useSpeechProcessor.ts` - STT 결과 처리만
- `src/hooks/useTemperatureResolver.ts` - 온도 충돌 해결
- `src/hooks/useOrderIntentRouter.ts` - Intent 라우팅

### 4.2 기존 훅 단순화

**수정 파일**: `src/hooks/useVoiceOrderProcessor.ts`

```typescript
// After: 조합된 훅
export function useVoiceOrderProcessor(options: Options) {
  const speechProcessor = useSpeechProcessor();
  const temperatureResolver = useTemperatureResolver();
  const intentRouter = useOrderIntentRouter();

  // 조율 로직만 담당
}
```

---

## 파일 변경 요약

### 새로 생성할 파일 (18개)

| 파일 | 목적 |
|------|------|
| `src/utils/koreanNumber.ts` | 한글 숫자 변환 |
| `src/components/modals/TemperatureModal.tsx` | 온도 선택 모달 |
| `src/components/modals/OrderConfirmModal.tsx` | 주문 확인 모달 |
| `src/components/modals/VoiceTemperatureSelect.tsx` | 음성 온도 선택 |
| `src/components/modals/index.ts` | 배럴 export |
| `src/hooks/useKioskSession.ts` | 세션 로직 통합 |
| `src/hooks/useFaceDetectionHandler.ts` | 얼굴 인식 핸들러 |
| `src/hooks/useSpeechProcessor.ts` | STT 처리 |
| `src/hooks/useTemperatureResolver.ts` | 온도 충돌 |
| `src/hooks/useOrderIntentRouter.ts` | Intent 라우팅 |
| `src/lib/intent/types.ts` | Intent 인터페이스 |
| `src/lib/intent/handlers/*.ts` | 9개 핸들러 |
| `src/lib/intent/index.ts` | Registry |
| `src/lib/speech/types.ts` | Speech 인터페이스 |
| `src/lib/speech/providers/*.ts` | 3개 Provider |
| `src/contexts/StoreContext.tsx` | 스토어 컨텍스트 |

### 수정할 파일 (4개)

| 파일 | 변경 내용 |
|------|----------|
| `src/app/page.tsx` | 845줄 → ~300줄 (분리 후) |
| `src/hooks/useGeminiOrder.ts` | switch문 → Registry 사용 |
| `src/hooks/useVoiceOrderProcessor.ts` | 분해된 훅 조합 |
| `src/hooks/useTextToSpeech.ts` | Provider 인터페이스 적용 |

---

## 구현 순서

### Step 1: 유틸리티 및 모달 분리
1. `koreanNumber.ts` 생성
2. 모달 컴포넌트 3개 생성
3. page.tsx에서 import 변경

### Step 2: Intent 핸들러 패턴
1. `src/lib/intent/types.ts` 생성
2. 9개 핸들러 구현
3. Registry 생성
4. `useGeminiOrder.ts` 리팩터링

### Step 3: Speech Provider 추상화
1. `src/lib/speech/types.ts` 생성
2. Provider 구현체 3개 생성
3. `useTextToSpeech.ts` 리팩터링

### Step 4: 세션/음성 훅 분해
1. `useKioskSession.ts` 생성
2. `useFaceDetectionHandler.ts` 생성
3. Voice processor 분해
4. page.tsx 최종 정리

### Step 5: 스토어 컨텍스트 (선택)
1. `StoreContext.tsx` 생성
2. 컴포넌트에서 직접 import 대신 Context 사용

---

## 검증 방법

### 기능 테스트
1. 음성 주문 (메뉴 추가/삭제/수량 변경)
2. 터치 주문
3. 온도 선택 모달
4. 주문 확정 플로우
5. 세션 타이머 (45초 → 스플래시)
6. 얼굴 인식 자동 시작

### 회귀 테스트
- 기존 기능 모두 동작 확인
- TTS/STT 폴백 체인 유지
- 에코 필터링 동작

---

## 예상 결과

### Before
| 파일 | 줄 수 | 책임 |
|------|------|------|
| page.tsx | 845 | 7개 |
| useVoiceOrderProcessor.ts | 663 | 6개 |
| useGeminiOrder.ts | 454 | 3개 |

### After
| 파일 | 줄 수 | 책임 |
|------|------|------|
| page.tsx | ~300 | 1개 (렌더링) |
| useKioskSession.ts | ~100 | 1개 (세션) |
| useVoiceOrderProcessor.ts | ~150 | 1개 (조율) |
| useGeminiOrder.ts | ~100 | 1개 (LLM 연동) |
| Intent handlers (각각) | ~30-50 | 1개씩 |

### SOLID 점수 예상
| 원칙 | Before | After |
|------|--------|-------|
| S | 2/10 | 8/10 |
| O | 3/10 | 8/10 |
| L | 8/10 | 8/10 |
| I | 7/10 | 8/10 |
| D | 2/10 | 7/10 |

---

## Task 체크리스트

### Phase 1: page.tsx 분해 (S 원칙)
- [ ] `src/utils/koreanNumber.ts` 생성 (한글 숫자 변환 함수)
- [ ] `src/components/modals/TemperatureModal.tsx` 생성
- [ ] `src/components/modals/OrderConfirmModal.tsx` 생성
- [ ] `src/components/modals/VoiceTemperatureSelect.tsx` 생성
- [ ] `src/components/modals/index.ts` 생성 (배럴 export)
- [ ] `src/hooks/useKioskSession.ts` 생성 (세션 로직 통합)
- [ ] `src/hooks/useFaceDetectionHandler.ts` 생성 (얼굴 인식 핸들러)
- [ ] `src/app/page.tsx` 리팩터링 (845줄 → ~300줄)

### Phase 2: Intent 핸들러 패턴 (O 원칙)
- [ ] `src/lib/intent/types.ts` 생성 (인터페이스 정의)
- [ ] `src/lib/intent/handlers/AddItemHandler.ts` 생성
- [ ] `src/lib/intent/handlers/RemoveItemHandler.ts` 생성
- [ ] `src/lib/intent/handlers/ChangeQuantityHandler.ts` 생성
- [ ] `src/lib/intent/handlers/ChangeTemperatureHandler.ts` 생성
- [ ] `src/lib/intent/handlers/MultiActionHandler.ts` 생성
- [ ] `src/lib/intent/handlers/ClearOrderHandler.ts` 생성
- [ ] `src/lib/intent/handlers/ConfirmOrderHandler.ts` 생성
- [ ] `src/lib/intent/handlers/ClarificationHandler.ts` 생성
- [ ] `src/lib/intent/handlers/UnknownHandler.ts` 생성
- [ ] `src/lib/intent/index.ts` 생성 (Registry)
- [ ] `src/hooks/useGeminiOrder.ts` 리팩터링 (switch → Registry)

### Phase 3: 의존성 역전 (D 원칙)
- [ ] `src/lib/speech/types.ts` 생성 (TTS/STT 인터페이스)
- [ ] `src/lib/speech/providers/SupertonicTTSProvider.ts` 생성
- [ ] `src/lib/speech/providers/WebSpeechTTSProvider.ts` 생성
- [ ] `src/lib/speech/providers/WebSpeechSTTProvider.ts` 생성
- [ ] `src/lib/speech/index.ts` 생성 (팩토리)
- [ ] `src/hooks/useTextToSpeech.ts` 리팩터링 (Provider 적용)

### Phase 4: useVoiceOrderProcessor 분해
- [ ] `src/hooks/useSpeechProcessor.ts` 생성 (STT 처리)
- [ ] `src/hooks/useTemperatureResolver.ts` 생성 (온도 충돌)
- [ ] `src/hooks/useOrderIntentRouter.ts` 생성 (Intent 라우팅)
- [ ] `src/hooks/useVoiceOrderProcessor.ts` 리팩터링 (조합)

### Phase 5: 스토어 컨텍스트 (선택)
- [ ] `src/contexts/StoreContext.tsx` 생성
- [ ] 컴포넌트에서 Context 사용으로 전환

### 검증
- [ ] 음성 주문 테스트 (메뉴 추가/삭제/수량 변경)
- [ ] 터치 주문 테스트
- [ ] 온도 선택 모달 테스트
- [ ] 주문 확정 플로우 테스트
- [ ] 세션 타이머 테스트 (45초 → 스플래시)
- [ ] 얼굴 인식 자동 시작 테스트
- [ ] TTS/STT 폴백 체인 테스트
- [ ] 에코 필터링 테스트
- [ ] `npm run build` 성공 확인

---

## 우선순위 및 소요 시간

| Phase | 우선순위 | 예상 소요 | 영향도 |
|-------|---------|----------|--------|
| Phase 1 | Critical | 2-3시간 | S 원칙 해결 |
| Phase 2 | High | 2시간 | O 원칙 해결 |
| Phase 3 | High | 1-2시간 | D 원칙 해결 |
| Phase 4 | Medium | 1-2시간 | S 원칙 추가 개선 |
| Phase 5 | Low | 1시간 | D 원칙 추가 개선 |

**총 예상 소요**: 7-10시간

---

## 참고 문서

- [CLAUDE.md](/CLAUDE.md) - 프로젝트 컨텍스트
- [docs/GEMINI-INTEGRATION.md](/docs/GEMINI-INTEGRATION.md) - Gemini LLM 통합
- [docs/TECH-STACK.md](/docs/TECH-STACK.md) - 기술 스택
