# AI Cafe 기술 스택 결정 문서

> **문서 버전:** 1.0.0
> **작성일:** 2026-01-24
> **상태:** 승인됨

---

## 1. 개요

### 1.1 프로젝트 목표

AI 기반 음성 인식 키오스크 시스템 개발

### 1.2 핵심 요구사항

- **비용 최소화**: 모든 AI 기능이 브라우저에서 무료로 동작
- **오프라인 지원**: 네트워크 의존성 최소화
- **프라이버시 보호**: 사용자 데이터가 기기를 떠나지 않음
- **한국어 지원**: 모든 AI 기능에서 한국어 완벽 지원

### 1.3 주요 기능

| 기능 | 설명 |
|------|------|
| Face Detection | 얼굴 인식 시 자동 인사 및 메뉴 표시 |
| STT (Speech-to-Text) | 음성으로 주문 접수 |
| TTS (Text-to-Speech) | 음성으로 안내 및 확인 |
| LLM | 자연어 주문 처리 및 이해 |

---

## 2. 기술 스택 결정

### 2.1 프레임워크

| 구분 | 기술 | 버전 | 선택 이유 |
|------|------|------|----------|
| Framework | Next.js | 14.x | App Router, Server Components, 최적화 |
| UI Library | React | 18.x | Next.js 기본, Hooks, Concurrent Features |
| Language | TypeScript | 5.x | 타입 안정성, 개발 생산성 |
| Styling | Tailwind CSS | 3.x | 유틸리티 기반, 빠른 개발 |

### 2.2 AI 기술 스택 요약

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Cafe Tech Stack                     │
├─────────────────────────────────────────────────────────────┤
│  Face Detection    │  MediaPipe + TensorFlow.js             │
│  STT               │  Whisper (Transformers.js)             │
│  TTS               │  Supertonic (ONNX)                     │
│  LLM               │  WebLLM (Qwen)                         │
├─────────────────────────────────────────────────────────────┤
│  모든 AI 처리: 100% 브라우저 로컬 │ 비용: $0/월            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Face Detection

### 3.1 선택: MediaPipe + TensorFlow.js

#### 패키지

```json
{
  "@tensorflow/tfjs": "^4.x",
  "@tensorflow-models/face-landmarks-detection": "^1.x",
  "@mediapipe/face_detection": "^0.4.x"
}
```

#### 선택 이유

| 항목 | 내용 |
|------|------|
| 정확도 | 478개 얼굴 랜드마크 추적 가능 |
| 성능 | 30+ FPS (데스크톱), 15+ FPS (모바일) |
| 크기 | ~3MB 경량 모델 |
| 가속 | WebGL/WASM 백엔드 지원 |
| 프라이버시 | 완전 로컬 처리, 서버 전송 없음 |

#### 사용 시나리오

```
사용자 접근 → 카메라 얼굴 감지 → 자동 인사 + 메뉴 표시
             ↓ (감지 실패)
         "주문하기" 버튼 표시
```

#### 기본 구현 예시

```typescript
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';

const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
const detector = await faceLandmarksDetection.createDetector(model, {
  runtime: 'tfjs',
  refineLandmarks: true,
  maxFaces: 1
});

const faces = await detector.estimateFaces(videoElement);
if (faces.length > 0) {
  // 얼굴 감지됨 → 인사 시작
  onFaceDetected();
}
```

### 3.2 대안 검토

| 대안 | 장점 | 단점 | 결론 |
|------|------|------|------|
| face-api.js | 사용 쉬움, 감정 인식 | 업데이트 중단 | ❌ 미채택 |
| OpenCV.js | 강력한 기능 | 무거움, 복잡함 | ❌ 미채택 |

---

## 4. STT (Speech-to-Text)

### 4.1 선택: Whisper via Transformers.js

#### 패키지

```json
{
  "@huggingface/transformers": "^3.x"
}
```

#### 추천 모델

| 모델 | 크기 | 속도 | 정확도 | 용도 |
|------|------|------|--------|------|
| `onnx-community/whisper-tiny` | ~40MB | 빠름 | 보통 | 빠른 응답 필요 시 |
| `onnx-community/whisper-base` | ~75MB | 중간 | 좋음 | 일반 사용 |
| `onnx-community/whisper-small` | ~250MB | 느림 | 매우 좋음 | 정확도 우선 |

#### 선택 이유

| 항목 | 내용 |
|------|------|
| 언어 지원 | 99+ 언어 (한국어 포함) |
| 언어 감지 | 자동 언어 감지 지원 |
| 오프라인 | 완전 오프라인 동작 |
| 프라이버시 | 음성 데이터가 기기를 떠나지 않음 |
| 비용 | 무료 (오픈소스) |

#### 한국어 성능

- 정확도: 약 85-90% (일반 환경)
- 소음 환경: 약 75-85%
- 사투리/방언: 약 70-80%

#### 기본 구현 예시

```typescript
import { pipeline } from '@huggingface/transformers';

// 모델 로드 (최초 1회)
const transcriber = await pipeline(
  'automatic-speech-recognition',
  'onnx-community/whisper-small',
  { device: 'webgpu' }  // 또는 'wasm'
);

// 음성 인식
const result = await transcriber(audioBlob, {
  language: 'korean',
  task: 'transcribe'
});

console.log(result.text);  // "아이스 아메리카노 두 잔 주세요"
```

### 4.2 Fallback: Web Speech API

Whisper 로딩 중이거나 실패 시 사용

```typescript
const recognition = new webkitSpeechRecognition();
recognition.lang = 'ko-KR';
recognition.continuous = false;

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  processOrder(transcript);
};

recognition.start();
```

#### Web Speech API 특징

| 항목 | 내용 |
|------|------|
| 장점 | 설치 불필요, 빠른 응답 |
| 단점 | Chrome 의존, 온라인 필요, 소음에 취약 |
| 사용 시점 | Whisper 로딩 전, Fallback |

### 4.3 대안 검토

| 대안 | 장점 | 단점 | 결론 |
|------|------|------|------|
| Web Speech API | 빠름, 설치 불필요 | 온라인 필요, 정확도 낮음 | Fallback으로 사용 |
| whisper.cpp WASM | 빠른 추론 | Transformers.js보다 설정 복잡 | ❌ 미채택 |
| OpenAI Whisper API | 최고 정확도 | 유료 ($0.006/분) | ❌ 비용 문제 |

---

## 5. TTS (Text-to-Speech)

### 5.1 선택: Supertonic TTS (ONNX)

> **참고**: 상세 구현은 `src/lib/tts/supertonic.ts` 및 `docs/SUPERTONIC-INTEGRATION-PLAN.md` 참조

#### 선택 이유

| 항목 | 내용 |
|------|------|
| 한국어 지원 | 네이티브 한국어 음성 지원 (F1-F5, M1-M5) |
| 음질 | 상업용 품질에 근접한 자연스러운 음성 |
| 크기 | ~70MB (4개 ONNX 모델, 캐시됨) |
| 실행 환경 | 100% 브라우저 로컬 (ONNX Runtime Web) |
| 비용 | 무료 (오픈소스) |

#### 모델 구성

| 모델 | 역할 |
|------|------|
| `duration_predictor.onnx` | 발화 시간 예측 |
| `text_encoder.onnx` | 텍스트 인코딩 |
| `vector_estimator.onnx` | 음성 벡터 추정 |
| `vocoder.onnx` | 오디오 생성 |

#### 한국어 전처리

- 영어→한국어 발음 변환 (coffee→커피, latte→라떼)
- 고유어 수사 변환 (2잔→두 잔, 3개→세 개)

#### 기본 구현 예시

```typescript
import { SupertonicTTS } from '@/lib/tts';

// 모델 로드 (최초 1회, 이후 캐시됨)
const tts = new SupertonicTTS('/tts/onnx');
await tts.load();

// 음성 생성 및 재생
await tts.speak('주문하시겠어요?', 'ko', {
  voice: '/tts/voice_styles/F1.json',
  speed: 1.05
});
```

### 5.2 Fallback: Web Speech API

Supertonic 로딩 중이거나 실패 시 사용

```typescript
const utterance = new SpeechSynthesisUtterance('주문하시겠어요?');
utterance.lang = 'ko-KR';
utterance.rate = 1.0;
utterance.pitch = 1.0;

speechSynthesis.speak(utterance);
```

### 5.3 대안 검토

| 대안 | 장점 | 단점 | 결론 |
|------|------|------|------|
| Web Speech API | 즉시 사용, 설치 불필요 | 로봇 음성, 부자연스러움 | Fallback으로 사용 |
| ElevenLabs API | 최고 품질 | 유료 ($5+/월) | ❌ 비용 문제 |
| OpenAI TTS API | 고품질 | 유료 ($0.015/1K자) | ❌ 비용 문제 |

---

## 6. LLM (Large Language Model)

### 6.1 선택: WebLLM (Qwen)

#### 패키지

```json
{
  "@mlc-ai/web-llm": "^0.2.x"
}
```

#### 추천 모델

| 모델 | 크기 | VRAM | 속도 | 한국어 | 용도 |
|------|------|------|------|--------|------|
| `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | ~300MB | ~1GB | 매우 빠름 | 기본 | 저사양 |
| `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` | ~1GB | ~2GB | 빠름 | 좋음 | 일반 사용 (권장) |
| `Qwen2.5-3B-Instruct-q4f16_1-MLC` | ~2GB | ~4GB | 중간 | 매우 좋음 | 고품질 |

#### 선택 이유

| 항목 | 내용 |
|------|------|
| 한국어 지원 | Qwen 모델은 100+ 언어 지원 (한국어 우수) |
| API 호환성 | OpenAI API 형식 100% 호환 |
| 실행 환경 | 100% 브라우저 로컬 (WebGPU) |
| 기능 | Streaming, JSON 모드, Function Calling 지원 |
| 비용 | 무료 (오픈소스) |

#### 시스템 요구사항

| 요구사항 | 최소 | 권장 |
|----------|------|------|
| 브라우저 | Chrome 113+ / Edge 113+ | 최신 버전 |
| GPU | WebGPU 지원 | 4GB+ VRAM |
| RAM | 8GB | 16GB |

#### 기본 구현 예시

```typescript
import { CreateMLCEngine } from '@mlc-ai/web-llm';

// 엔진 초기화
const engine = await CreateMLCEngine(
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  {
    initProgressCallback: (progress) => {
      console.log(`Loading: ${Math.round(progress.progress * 100)}%`);
    }
  }
);

// 주문 처리 프롬프트
const systemPrompt = `당신은 카페 주문을 처리하는 AI입니다.
사용자의 주문을 분석하여 JSON 형식으로 반환하세요.

메뉴:
- 아메리카노 (HOT/ICE) - 4,500원
- 카페라떼 (HOT/ICE) - 5,000원
- 바닐라라떼 (HOT/ICE) - 5,500원
- 카푸치노 (HOT) - 5,000원

출력 형식:
{
  "items": [
    {"name": "메뉴명", "temperature": "HOT/ICE", "quantity": 수량, "price": 가격}
  ],
  "total": 총액
}`;

// 주문 처리
const response = await engine.chat.completions.create({
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: '아이스 아메리카노 2개랑 따뜻한 카페라떼 하나 주세요' }
  ],
  response_format: { type: 'json_object' }
});

const order = JSON.parse(response.choices[0].message.content);
// {
//   "items": [
//     {"name": "아메리카노", "temperature": "ICE", "quantity": 2, "price": 9000},
//     {"name": "카페라떼", "temperature": "HOT", "quantity": 1, "price": 5000}
//   ],
//   "total": 14000
// }
```

### 6.2 Fallback: 규칙 기반 파싱

WebLLM 로딩 중이거나 WebGPU 미지원 시 사용

```typescript
const MENU_KEYWORDS = {
  '아메리카노': { name: '아메리카노', price: 4500 },
  '카페라떼': { name: '카페라떼', price: 5000 },
  '라떼': { name: '카페라떼', price: 5000 },
  '바닐라라떼': { name: '바닐라라떼', price: 5500 },
  '카푸치노': { name: '카푸치노', price: 5000 },
};

const QUANTITY_KEYWORDS = {
  '한': 1, '하나': 1, '1': 1,
  '두': 2, '둘': 2, '2': 2,
  '세': 3, '셋': 3, '3': 3,
};

const TEMPERATURE_KEYWORDS = {
  '아이스': 'ICE', '차가운': 'ICE', '시원한': 'ICE',
  '따뜻한': 'HOT', '뜨거운': 'HOT', '핫': 'HOT',
};

function parseOrder(text: string): Order {
  // 키워드 기반 주문 파싱 로직
  // ...
}
```

### 6.3 대안 검토

| 대안 | 장점 | 단점 | 결론 |
|------|------|------|------|
| Ollama (로컬 서버) | 더 큰 모델 가능 | 별도 서버 필요 | 고급 사용자용 옵션 |
| OpenAI API | 최고 성능 | 유료 | ❌ 비용 문제 |
| Claude API | 최고 성능 | 유료 | ❌ 비용 문제 |

---

## 7. Fallback 전략

### 7.1 전체 Fallback 체인

```
┌─────────────────────────────────────────────────────────────┐
│                     Fallback Strategy                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Face Detection                                              │
│  ┌──────────────┐    실패    ┌──────────────────────┐       │
│  │  MediaPipe   │ ────────→ │  "주문하기" 버튼 표시  │       │
│  └──────────────┘            └──────────────────────┘       │
│                                                              │
│  STT (Speech-to-Text)                                        │
│  ┌──────────────┐    실패    ┌──────────────┐    실패       │
│  │  Whisper.js  │ ────────→ │ Web Speech API│ ────────→    │
│  └──────────────┘            └──────────────┘              │
│                                          ↓                   │
│                              ┌──────────────────────┐       │
│                              │  터치/클릭 입력 유도  │       │
│                              └──────────────────────┘       │
│                                                              │
│  TTS (Text-to-Speech)                                        │
│  ┌──────────────┐    실패    ┌──────────────┐               │
│  │  Supertonic   │ ────────→ │ Web Speech API│               │
│  └──────────────┘            └──────────────┘               │
│                                                              │
│  LLM                                                         │
│  ┌──────────────┐    실패    ┌──────────────┐               │
│  │   WebLLM     │ ────────→ │  규칙 기반 파싱 │               │
│  └──────────────┘            └──────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 로딩 상태 관리

```typescript
interface AIStatus {
  faceDetection: 'loading' | 'ready' | 'error';
  stt: 'loading' | 'ready' | 'fallback' | 'error';
  tts: 'loading' | 'ready' | 'fallback' | 'error';
  llm: 'loading' | 'ready' | 'fallback' | 'error';
}

// 우선순위: 필수 기능 먼저 로드
const loadOrder = ['faceDetection', 'stt', 'tts', 'llm'];
```

---

## 8. 성능 최적화

### 8.1 모델 로딩 전략

```typescript
// 1. 페이지 로드 시 필수 모델만 로드
const essentialModels = ['faceDetection'];

// 2. 유휴 시간에 나머지 모델 로드
if ('requestIdleCallback' in window) {
  requestIdleCallback(() => loadSTTModel());
  requestIdleCallback(() => loadTTSModel());
  requestIdleCallback(() => loadLLMModel());
}

// 3. IndexedDB에 모델 캐시
// Transformers.js와 WebLLM은 자동으로 캐시 관리
```

### 8.2 예상 로딩 시간

| 모델 | 첫 로드 | 캐시 후 |
|------|---------|---------|
| Face Detection | 2-3초 | <1초 |
| Whisper (small) | 10-20초 | 2-3초 |
| Supertonic TTS | 5-10초 | 1-2초 |
| WebLLM (1.5B) | 30-60초 | 5-10초 |

### 8.3 메모리 관리

```typescript
// 사용하지 않는 모델 해제
async function releaseModel(modelType: string) {
  switch (modelType) {
    case 'stt':
      transcriber = null;
      break;
    case 'tts':
      tts = null;
      break;
    case 'llm':
      await engine.unload();
      break;
  }

  // 가비지 컬렉션 힌트
  if ('gc' in window) {
    (window as any).gc();
  }
}
```

---

## 9. 브라우저 호환성

### 9.1 지원 브라우저

| 브라우저 | 버전 | Face | STT | TTS | LLM |
|----------|------|------|-----|-----|-----|
| Chrome | 113+ | ✅ | ✅ | ✅ | ✅ |
| Edge | 113+ | ✅ | ✅ | ✅ | ✅ |
| Firefox | 최신 | ✅ | ✅ | ✅ | ⚠️ WebGPU 제한 |
| Safari | 18+ | ✅ | ✅ | ✅ | ⚠️ WebGPU 제한 |

### 9.2 필수 API 확인

```typescript
function checkBrowserSupport(): BrowserSupport {
  return {
    webgl: !!document.createElement('canvas').getContext('webgl2'),
    webgpu: 'gpu' in navigator,
    wasm: typeof WebAssembly === 'object',
    mediaDevices: 'mediaDevices' in navigator,
    speechRecognition: 'webkitSpeechRecognition' in window,
    speechSynthesis: 'speechSynthesis' in window,
  };
}
```

---

## 10. 비용 비교

### 10.1 월간 비용 비교 (1만 건 주문 기준)

| 항목 | API 기반 | 브라우저 기반 (선택) |
|------|----------|---------------------|
| STT | $60 (Whisper API) | **$0** |
| TTS | $50 (ElevenLabs) | **$0** |
| LLM | $100+ (OpenAI) | **$0** |
| **총합** | **$210+/월** | **$0/월** |

### 10.2 연간 절감 효과

```
월간 절감: $210
연간 절감: $2,520
3년 절감:  $7,560
```

---

## 11. 참고 자료

### 11.1 공식 문서

- [TensorFlow.js Models](https://www.tensorflow.org/js/models)
- [MediaPipe Face Detection](https://developers.google.com/mediapipe/solutions/vision/face_detector)
- [Transformers.js](https://huggingface.co/docs/transformers.js)
- [Supertonic TTS](https://github.com/supertone-inc/supertonic)
- [WebLLM](https://webllm.mlc.ai/docs/)

### 11.2 관련 링크

- [Whisper.cpp WASM Demo](https://ggml.ai/whisper.cpp/)
- [Supertonic Web Demo](https://supertone-inc.github.io/supertonic/)
- [WebLLM Demo](https://webllm.mlc.ai/)
- [Best Korean LLM 2026](https://www.siliconflow.com/articles/en/best-open-source-llm-for-korean)

---

## 12. 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 1.0.0 | 2026-01-24 | 초기 문서 작성 | AI Cafe Team |
