# AI Cafe - Claude Context

## Project Overview
AI-powered voice-enabled kiosk system for coffee ordering. All AI features run 100% in-browser.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State**: Zustand

### AI Technologies (Browser Local)
| Feature | Library | Size |
|---------|---------|------|
| Face Detection | MediaPipe + TensorFlow.js | ~3MB |
| STT | Whisper via Transformers.js | ~250MB |
| TTS | Supertonic (ONNX) → Web Speech API | ~70MB (cached) |
| LLM | WebLLM + Qwen2.5-1.5B | ~1GB |

### TTS Architecture (Supertonic)
**Primary Engine**: Supertonic TTS (ONNX Runtime Web)
- **Models**: 4 ONNX files in `public/tts/onnx/`
  - `duration_predictor.onnx`, `text_encoder.onnx`
  - `vector_estimator.onnx`, `vocoder.onnx`
- **Voice Styles**: Korean F1-F5, M1-M5 (JSON in `public/tts/voice_styles/`)
- **Caching**: Cache API로 모델 영속화 (첫 로드 후 캐시됨)

**Korean Text Preprocessing**:
- 영어→한국어 발음 변환 (coffee→커피, latte→라떼)
- 고유어 수사 변환 (2잔→두 잔, 3개→세 개)

**Git LFS Configuration**:
```gitattributes
*.onnx filter=lfs diff=lfs merge=lfs -text
```
ONNX 모델은 Git LFS로 관리. `.gitattributes` 설정 후 파일 추가 필수.

## Architecture

### Single-Screen Layout (1920x1080)
```
┌────────────────────────────────────────────────────────┐
│                    Header (AI Status)                   │
├──────────────────────────┬─────────────────────────────┤
│     Menu Section (65%)   │    Order Section (35%)      │
├──────────────────────────┴─────────────────────────────┤
│                  Queue Section (Fixed)                  │
└────────────────────────────────────────────────────────┘
```

### Responsive Viewport Scaling (kiosk-container 패턴)
FHD 기준 디자인을 모든 화면 크기에 맞게 스케일링:

```typescript
// KioskLayout.tsx, ServiceLoader.tsx, SplashScreen.tsx
const scaleX = viewportWidth / 1920;
const scaleY = viewportHeight / 1080;
const scale = Math.min(scaleX, scaleY); // 확대/축소 모두 허용
```

- **타겟 해상도**: 1920x1080 (가로) / 1080x1920 (세로)
- **스케일링**: 작은 화면은 축소, 큰 화면은 확대
- **적용**: `transform: translate(-50%, -50%) scale(${scale})`

**kiosk-container 래퍼 패턴** (전체 화면 컴포넌트에 필수):
```tsx
<div className="kiosk-viewport">
  <div
    className={`kiosk-container kiosk-${orientation}`}
    style={{
      width: fhd.width,
      height: fhd.height,
      transform: `translate(-50%, -50%) scale(${scale})`,
    }}
  >
    {/* 컴포넌트 내용 */}
  </div>
</div>
```

**CSS 주의사항**:
- 컨테이너 내부는 `position: relative` 사용 (fixed 사용 금지)
- `position: fixed`는 부모의 transform을 무시하여 스케일링이 깨짐
- flexbox 가운데 정렬 시 `flex: 1`과 `justify-content: center` 동시 사용 불가

### KioskLayout Props
| Prop | Type | 위치 |
|------|------|------|
| `menuSection` | ReactNode | MainContent (65%) |
| `orderSection` | ReactNode | MainContent (35%) |
| `chatSection` | ReactNode | MainContent (overlay) |
| `cameraPreview` | ReactNode | Header |
| `sessionTimer` | ReactNode | Header (로고 옆) |
| `preparingQueue` | ReactNode | QueueSection |
| `readyQueue` | ReactNode | QueueSection |

### Key Directories
- `src/components/` - React components by feature
- `src/hooks/` - Custom hooks (useSpeechToText, useTextToSpeech, useLLM, useFaceDetection)
- `src/store/` - Zustand stores (order, queue, kiosk, ai)
- `src/workers/` - Web Workers for AI models
- `src/lib/ai/` - AI model integrations
- `src/data/` - Static menu data

### State Stores
- **kioskStore**: Kiosk state machine (idle/active/ordering/confirming)
- **orderStore**: Current order items
- **queueStore**: Preparing and ready queues
- **aiStore**: AI model loading status
- **chatStore**: Chat messages and conversation state
- **layoutStore**: Screen orientation (landscape/portrait)

### AI Model Loading Strategy
1. **Immediate**: Face Detection (~3MB)
2. **Idle**: TTS (~85MB) - for greeting
3. **On Interaction**: STT + LLM (~1.25GB)

### Fallback Chain
- Face Detection → Manual start button
- STT (Whisper) → Web Speech API → Touch input
- TTS (Supertonic ONNX) → Web Speech API
- LLM (WebLLM) → Rule-based parsing

## Development

### Prerequisites
- Node.js 18+
- Chrome/Edge with WebGPU support
- 8GB+ RAM (16GB recommended)

### Commands
```bash
npm install    # Install dependencies
npm run dev    # Development server
npm run build  # Production build
```

### Critical Headers (COOP/COEP)
SharedArrayBuffer requires these headers:
- Cross-Origin-Opener-Policy: same-origin
- Cross-Origin-Embedder-Policy: require-corp

## Kiosk Flow
1. Face detected → Welcome overlay + TTS greeting
2. User taps or speaks → Active state
3. Touch/voice ordering → Order list updates
4. Confirm → Add to queue → TTS announcement
5. 45s inactivity → Return to splash screen

### Session Timer Details
- **Total session**: 45초
- **Voice input window**: 처음 15초만 (잔여 45초~31초)
- **15초 경과** (잔여 30초): 마이크 비활성화 + 안내 메시지
- **35초 경과** (잔여 10초): 세션 종료 임박 경고
- **45초 경과** (잔여 0초): 스플래시 화면으로 복귀
- **화면 터치**: 세션 타이머 45초로 리셋

## Voice Order Processing

### Menu Matching Pipeline (`src/utils/menuMatcher.ts`)
1. **Speech Correction** - 50+ Korean pronunciation variations mapped
2. **Fuzzy Matching** - Levenshtein distance with dynamic threshold (30% of name length)
3. **Temperature Extraction** - HOT/ICE keywords from surrounding context
4. **Quantity Parsing** - Korean numerals (한 잔, 두 잔) and digits (2잔)
5. **Multi-item Support** - Parse multiple items from single utterance

**Example:**
```typescript
matchVoiceToMenu("아이스 아메리카노 두 잔하고 따뜻한 라떼")
// → [{item: Americano, temp: ICE, qty: 2}, {item: Latte, temp: HOT, qty: 1}]
```

### Quantity Extraction Strategy
수량 추출은 상황에 따라 다른 전략 사용:

| 상황 | 전략 | 예시 |
|------|------|------|
| 단일 메뉴 | 전체 텍스트에서 추출 | "라떼 세 잔" → qty: 3 |
| 복수 메뉴 | 메뉴 이름 뒤 컨텍스트에서 추출 | "라떼 2잔 아메 1잔" |
| "각각" 패턴 | 수량을 순서대로 매칭 | "라떼 아메 각각 2잔 3잔" |

**한글 수량 패턴** (큰 수부터 검사하여 부분 매칭 방지):
- 한 잔/하나, 두 잔/둘, 세 잔/셋, 네 잔/넷, 다섯 잔...
- 숫자 + 단위: 2잔, 3개, 5컵
- 공백 유무 모두 처리: "두잔" = "두 잔"

## Design System

### Theme: "Midnight Roast" (`src/styles/design-tokens.css`)
- **Style**: Art Deco meets Modern Luxury with glassmorphism
- **Colors**: Coffee-inspired palette (aged gold, espresso blacks, cream whites)
- **Typography**: Pretendard Variable (Korean + Latin)
- **Effects**: Backdrop blur, golden accents, fluid responsive scaling

## Patterns & Best Practices

### Stale Closure Prevention
Browser API callbacks can capture stale state. Use refs for always-fresh callbacks:

```typescript
const callbacksRef = useRef({ onResult, onError });
callbacksRef.current = { onResult, onError }; // Update during render

recognition.onresult = (event) => {
  callbacksRef.current.onResult?.(transcript); // Always current
};
```

Used in: `useSpeechToText.ts`, `useTextToSpeech.ts`

### TTS Echo Filter
TTS 출력이 마이크에 피드백되어 STT를 트리거하는 문제 방지:

```typescript
// src/utils/echoFilter.ts
const ECHO_WINDOW_MS = 3000; // TTS 종료 후 3초간 필터링

// 에코 체크 (STT 결과 처리 전에 호출)
if (isEcho(transcript)) {
  console.log('[Echo Filter] Filtered:', transcript);
  return; // STT 결과 무시
}
```

**주의사항**:
- `onspeechstart`에서 `resetActivity()` 호출 금지 - TTS 에코가 타이머를 리셋할 수 있음
- 타이머 리셋은 에코 필터링 후 `onSpeechResult`에서만 수행

### Session Timer Pattern
`useSyncExternalStore` + ref 기반으로 stale closure 방지:

```typescript
// useSessionTimer.ts
const isActiveRef = useRef(false);
const timeLeftRef = useRef(SESSION_TIMEOUT);
const snapshotRef = useRef<SessionState>({ isActive: false, timeLeft: SESSION_TIMEOUT });

// 값이 변경될 때만 새 객체 생성 (무한 루프 방지)
const updateSnapshot = useCallback(() => {
  if (current.isActive !== isActiveRef.current || current.timeLeft !== timeLeftRef.current) {
    snapshotRef.current = { isActive: isActiveRef.current, timeLeft: timeLeftRef.current };
  }
}, []);

const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
```

### TTS Concurrent Call Handling
Supertonic TTS는 동시 호출 시 에러 발생. 상태 플래그로 race condition 방지:

```typescript
// src/lib/tts/supertonic.ts
class SupertonicTTS {
  private _isSpeaking = false;      // 재생 상태 추적
  private _stopRequested = false;   // 중단 요청 플래그

  async speak(text: string, lang: Language, options: SpeakOptions = {}): Promise<void> {
    // 이전 음성 자동 중단
    if (this._isSpeaking) {
      this.stop();
      await new Promise(resolve => setTimeout(resolve, 50)); // 클린업 대기
    }

    try {
      this._isSpeaking = true;
      this._stopRequested = false;

      for (const chunk of textChunks) {
        if (this._stopRequested) return; // 중단 요청 체크
        await synthesizeChunk(chunk);
      }

      await this.playAudio(wavData);
    } finally {
      this._isSpeaking = false;
    }
  }

  stop(): void {
    this._stopRequested = true;
    this._isSpeaking = false;
    this.currentSource?.stop();
  }
}
```

**핵심 포인트**:
- `_isSpeaking`: 새 호출 시 이전 재생 감지
- `_stopRequested`: 긴 추론 중 graceful abort
- 50ms 딜레이: AudioContext 클린업 보장
- finally 블록: 에러 시에도 플래그 리셋

## Gemini LLM Integration

### 개요
Gemini LLM을 통한 음성 의도 분석 시스템. 기존 `menuMatcher`의 규칙 기반 처리를 보완.

**설계 원칙: 음성 = 터치 동일 동작**
- 음성/터치 모두 동일한 CTA 함수 (`useOrderActions`) 호출
- 동일한 피드백 메시지 + TTS

### 파일 구조
```
src/lib/gemini/
├── types.ts      # Intent 타입 정의
├── prompts.ts    # 시스템 프롬프트
├── client.ts     # API 클라이언트
└── index.ts      # Export

src/app/api/gemini/
└── route.ts      # 서버 API 라우트 (API 키 보호)

src/hooks/
├── useOrderActions.ts   # CTA 핸들러 통합
└── useGeminiOrder.ts    # Intent→CTA 연결
```

### Intent 타입
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
```

### 데이터 흐름
```
[음성] → [STT] → [Gemini API] → [Intent] → [useOrderActions] → [동일 응답]
                       ↓ 에러/낮은 confidence
               [폴백: menuMatcher]
```

### 환경 설정
```bash
# .env.local (NEXT_PUBLIC_ 접두사 없음 - 서버 전용)
GEMINI_API_KEY=your-api-key
```

### 사용 방법
```typescript
// useVoiceOrderProcessor 옵션
useVoiceOrderProcessor({
  speakRef,
  resetActivity,
  useGemini: true,  // Gemini 사용 (기본값)
  onOrderConfirmed: () => { ... },
});
```

### 폴백 전략
| 조건 | 폴백 트리거 |
|------|------------|
| API 에러 | 네트워크 오류, 5xx |
| 타임아웃 | 5초 초과 |
| 낮은 Confidence | 0.5 미만 |
| 파싱 에러 | JSON 파싱 실패 |

폴백 시 `[Gemini Fallback]` 로그 출력 후 기존 `menuMatcher` 사용.

상세 문서: [docs/GEMINI-INTEGRATION.md](./docs/GEMINI-INTEGRATION.md)

## Korean Language
- STT: Whisper supports Korean (CER ~11%)
- TTS: Supertonic with Korean preprocessing (영어→한글 발음, 고유어 수사)
- LLM: Qwen supports Korean parsing / Gemini for intent analysis
