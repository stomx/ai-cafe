# AI Cafe 기술 스택

> **문서 버전:** 2.0.0
> **최종 업데이트:** 2026-01-25

---

## 1. 개요

AI 기반 음성 주문 키오스크 시스템. 모든 AI 기능이 브라우저에서 로컬로 동작.

### 핵심 요구사항

- **비용 최소화**: 모든 AI 기능 무료 (브라우저 로컬)
- **오프라인 지원**: 네트워크 의존성 최소화
- **프라이버시 보호**: 사용자 데이터가 기기를 떠나지 않음
- **한국어 지원**: 모든 AI 기능에서 한국어 완벽 지원

---

## 2. 프레임워크

| 구분 | 기술 | 버전 |
|------|------|------|
| Framework | Next.js | 14.x |
| UI Library | React | 18.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.x |
| State | Zustand | 5.x |

---

## 3. AI 기술 스택

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Cafe Tech Stack                        │
├─────────────────────────────────────────────────────────────┤
│  Face Detection  │  MediaPipe Face Detector (WASM/WebGPU)   │
│  STT             │  Web Speech API                           │
│  TTS             │  Supertonic (ONNX Runtime Web)            │
│  NLU             │  규칙 기반 메뉴 매칭 (menuMatcher.ts)     │
├─────────────────────────────────────────────────────────────┤
│  모든 AI 처리: 100% 브라우저 로컬 │ 비용: $0/월             │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Face Detection

### 구현: MediaPipe Face Detector

```typescript
// src/hooks/useFaceDetection.ts
import { FaceDetector, FilesetResolver } from '@mediapipe/tasks-vision';

const detector = await FaceDetector.createFromOptions(filesetResolver, {
  baseOptions: {
    modelAssetPath: 'blaze_face_short_range.tflite',
    delegate: 'GPU',
  },
  runningMode: 'VIDEO',
  minDetectionConfidence: 0.5,
});
```

| 항목 | 내용 |
|------|------|
| 라이브러리 | `@mediapipe/tasks-vision` |
| 모델 | BlazeFace Short Range (~3MB) |
| 백엔드 | WebGPU / WASM |
| Fallback | 카메라 활성 상태로 얼굴 감지 대체 |

---

## 5. STT (Speech-to-Text)

### 구현: Web Speech API

```typescript
// src/hooks/useSpeechToText.ts
const recognition = new webkitSpeechRecognition();
recognition.lang = 'ko-KR';
recognition.continuous = false;
recognition.interimResults = true;

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  // 주문 처리
};
```

| 항목 | 내용 |
|------|------|
| API | Web Speech API (Chrome 내장) |
| 언어 | `ko-KR` (한국어) |
| 특징 | 설치 불필요, 즉시 사용 가능 |
| 제한 | Chrome/Edge 전용, 온라인 필요 |

### 에코 필터링

TTS 출력이 마이크로 피드백되는 문제 방지:

```typescript
// src/utils/echoFilter.ts
const ECHO_WINDOW_MS = 3000; // TTS 종료 후 3초간 필터링

if (isEcho(transcript)) {
  return; // STT 결과 무시
}
```

---

## 6. TTS (Text-to-Speech)

### 구현: Supertonic TTS (ONNX)

```typescript
// src/lib/tts/supertonic.ts
const tts = new SupertonicTTS('/tts/onnx');
await tts.load();

await tts.speak('주문하시겠어요?', 'ko', {
  voice: '/tts/voice_styles/F1.json',
  speed: 1.05
});
```

| 항목 | 내용 |
|------|------|
| 엔진 | Supertonic TTS (ONNX Runtime Web) |
| 모델 | 4개 ONNX 파일 (~70MB, 캐시됨) |
| 음성 | 한국어 F1-F5, M1-M5 |
| Fallback | Web Speech API |

### ONNX 모델 구성

| 모델 | 역할 |
|------|------|
| `duration_predictor.onnx` | 발화 시간 예측 |
| `text_encoder.onnx` | 텍스트 인코딩 |
| `vector_estimator.onnx` | 음성 벡터 추정 |
| `vocoder.onnx` | 오디오 생성 |

### 한국어 전처리

```typescript
// 영어 → 한국어 발음 변환
'coffee' → '커피', 'latte' → '라떼', 'hot' → '핫'

// 고유어 수사 변환
'2잔' → '두 잔', '3개' → '세 개'
```

---

## 7. NLU (Natural Language Understanding)

### 구현: 규칙 기반 메뉴 매칭

```typescript
// src/utils/menuMatcher.ts
const result = matchVoiceToMenu("아이스 아메리카노 두 잔하고 따뜻한 라떼");
// → [{item: Americano, temp: ICE, qty: 2}, {item: Latte, temp: HOT, qty: 1}]
```

| 항목 | 내용 |
|------|------|
| 발음 교정 | 50+ 한국어 발음 변형 매핑 |
| 퍼지 매칭 | Levenshtein 거리 (30% 임계값) |
| 온도 추출 | HOT/ICE 키워드 컨텍스트 분석 |
| 수량 파싱 | 한글 수사 (한, 두, 세...) + 숫자 |

### 의도 분류

```typescript
// src/hooks/useVoiceOrderProcessor.ts
isConfirmation(text)     // 긍정 응답 (네, 좋아요)
isRejection(text)        // 거부 응답 (아니요, 취소)
isTemperatureResponse()  // 온도 응답 (핫, 아이스)
isOrderConfirmIntent()   // 주문 확정 (주문할게요)
```

---

## 8. Fallback 전략

```
Face Detection
  MediaPipe → 카메라 활성 상태 fallback → "주문하기" 버튼

STT
  Web Speech API → 터치 입력 유도

TTS
  Supertonic (ONNX) → Web Speech API

NLU
  규칙 기반 매칭 (fallback 불필요)
```

---

## 9. 브라우저 호환성

| 브라우저 | 버전 | Face | STT | TTS |
|----------|------|------|-----|-----|
| Chrome | 113+ | ✅ | ✅ | ✅ |
| Edge | 113+ | ✅ | ✅ | ✅ |
| Firefox | 최신 | ✅ | ⚠️ | ✅ |
| Safari | 18+ | ✅ | ⚠️ | ✅ |

> ⚠️ Web Speech API는 Chrome/Edge에서 가장 안정적

---

## 10. 참고 자료

- [MediaPipe Face Detector](https://developers.google.com/mediapipe/solutions/vision/face_detector)
- [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/tutorials/web/)
- [Supertonic TTS](https://github.com/supertone-inc/supertonic)
