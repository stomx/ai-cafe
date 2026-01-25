# Supertonic TTS 통합 계획

> AI Cafe 프로젝트에 Supertonic TTS를 적용하기 위한 다중 전문가 관점 분석

## 📋 프로젝트 개요

| 항목 | 현재 | 목표 |
|------|------|------|
| TTS 엔진 | Web Speech API | Supertonic (ONNX) |
| 모델 크기 | 0 (브라우저 내장) | ~60-80MB |
| 한국어 품질 | 브라우저 의존 | 네이티브 고품질 |
| 음성 선택 | 제한적 | M1-M5, F1-F5 |
| 오프라인 | ❌ | ✅ (모델 캐시 후) |

---

## 🏗️ 1. 시스템 아키텍트 관점

### 1.1 전체 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                      AI Cafe App                          │
├─────────────────────────────────────────────────────────────┤
│  page.tsx                                                    │
│    └── useTextToSpeech (통합 훅)                             │
│          ├── SupertonicTTS (Primary)                        │
│          │     ├── ONNX Runtime Web (WebGPU/WASM)          │
│          │     └── 모델 파일 (public/tts/)                  │
│          └── WebSpeechTTS (Fallback)                        │
│                └── window.speechSynthesis                   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 모듈 구조

```
src/
├── lib/
│   └── tts/
│       ├── index.ts              # 통합 내보내기
│       ├── supertonic.ts         # Supertonic 엔진 (helper.js 포팅)
│       ├── web-speech.ts         # Web Speech API 래퍼
│       └── types.ts              # 공통 타입 정의
├── hooks/
│   └── useTextToSpeech.ts        # 통합 훅 (인터페이스 유지)
└── store/
    └── aiStore.ts                # TTS 상태 관리 (기존)

public/
└── tts/
    ├── onnx/
    │   ├── tts.json
    │   ├── duration_predictor.onnx
    │   ├── text_encoder.onnx
    │   ├── vector_estimator.onnx
    │   └── vocoder.onnx
    └── voice_styles/
        ├── ko_F1.json            # 한국어 여성 1
        ├── ko_F2.json            # 한국어 여성 2
        ├── ko_M1.json            # 한국어 남성 1
        └── ko_M2.json            # 한국어 남성 2
```

### 1.3 통합 전략: Adapter Pattern

```typescript
// lib/tts/types.ts
interface TTSEngine {
  name: string;
  isLoaded: boolean;
  loadProgress: number;

  load(): Promise<void>;
  speak(text: string, options?: SpeakOptions): Promise<void>;
  stop(): void;
  dispose(): void;
}

interface SpeakOptions {
  voice?: string;      // 'ko_F1', 'ko_M1', etc.
  speed?: number;      // 0.5 - 2.0
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}
```

### 1.4 위험 요소 및 대응

| 위험 | 영향 | 대응 방안 |
|------|------|----------|
| WebGPU 미지원 브라우저 | 높음 | WASM 자동 폴백 (onnxruntime-web 내장) |
| 모델 로딩 실패 | 높음 | Web Speech API 폴백 |
| 메모리 부족 | 중간 | 모델 언로드 기능, 경고 표시 |
| CORS 이슈 | 중간 | same-origin 호스팅 또는 CORS 헤더 |

---

## ⚛️ 2. 프론트엔드 엔지니어 관점

### 2.1 훅 인터페이스 설계

```typescript
// hooks/useTextToSpeech.ts (확장된 인터페이스)
interface UseTextToSpeechOptions {
  // 기존 옵션 유지
  language?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;

  // 새로운 옵션
  engine?: 'auto' | 'supertonic' | 'webspeech';
  voice?: string;                    // 'ko_F1', 'ko_M1', etc.
  autoLoad?: boolean;                // 자동 모델 로딩 (default: false)
}

interface UseTextToSpeechReturn {
  // 기존 반환값 유지
  isSpeaking: boolean;
  isSupported: boolean;
  speak: (text: string) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  error: string | null;

  // 새로운 반환값
  engine: 'supertonic' | 'webspeech' | null;
  isModelLoading: boolean;
  loadProgress: number;              // 0-100
  loadModel: () => Promise<void>;    // 수동 로딩
  availableVoices: VoiceInfo[];
  setVoice: (voiceId: string) => void;
}

interface VoiceInfo {
  id: string;           // 'ko_F1'
  name: string;         // '한국어 여성 1'
  language: string;     // 'ko'
  gender: 'male' | 'female';
}
```

### 2.2 상태 관리 확장

```typescript
// store/aiStore.ts 확장
interface AIStore {
  // 기존 상태 유지
  tts: ModelStatus;

  // 새로운 상태
  ttsEngine: 'supertonic' | 'webspeech' | null;
  ttsLoadProgress: number;
  ttsVoice: string;

  // 액션
  setTTSEngine: (engine: 'supertonic' | 'webspeech') => void;
  setTTSLoadProgress: (progress: number) => void;
  setTTSVoice: (voice: string) => void;
}
```

### 2.3 컴포넌트 통합

```tsx
// 사용 예시 - page.tsx
const {
  speak,
  stop,
  isSpeaking,
  isModelLoading,
  loadProgress,
  loadModel,
  engine
} = useTextToSpeech({
  engine: 'auto',
  voice: 'ko_F1',
  autoLoad: false,  // 명시적 로딩
  onEnd: () => console.log('TTS 완료'),
});

// 세션 시작 시 모델 로딩
useEffect(() => {
  if (isSessionActive && !engine) {
    loadModel();
  }
}, [isSessionActive]);

// 주문 확인 시 음성 출력
const confirmOrder = () => {
  speak(formatOrderConfirmation(order));
};
```

### 2.4 로딩 UI 컴포넌트

```tsx
// components/ui/TTSLoadingIndicator.tsx
function TTSLoadingIndicator({ progress }: { progress: number }) {
  return (
    <div className="tts-loading">
      <div className="tts-loading-bar" style={{ width: `${progress}%` }} />
      <span>음성 엔진 로딩 중... {progress}%</span>
    </div>
  );
}
```

---

## 🤖 3. AI/ML 엔지니어 관점

### 3.1 모델 로딩 최적화

```typescript
// lib/tts/supertonic.ts
class SupertonicTTS implements TTSEngine {
  private sessions: Map<string, ort.InferenceSession> = new Map();
  private config: TTSConfig | null = null;

  async load(onProgress?: (progress: number) => void): Promise<void> {
    const basePath = '/tts/onnx';

    // 1. 설정 파일 로드 (5%)
    onProgress?.(5);
    this.config = await fetch(`${basePath}/tts.json`).then(r => r.json());

    // 2. 세션 옵션 설정
    const sessionOptions: ort.InferenceSession.SessionOptions = {
      executionProviders: ['webgpu', 'wasm'],  // 자동 폴백
      graphOptimizationLevel: 'all',
      enableCpuMemArena: true,
    };

    // 3. 모델 병렬 로딩 (각 25%)
    const models = [
      'duration_predictor',
      'text_encoder',
      'vector_estimator',
      'vocoder'
    ];

    const loadPromises = models.map(async (name, i) => {
      const session = await ort.InferenceSession.create(
        `${basePath}/${name}.onnx`,
        sessionOptions
      );
      this.sessions.set(name, session);
      onProgress?.(5 + ((i + 1) * 23));  // 5 + 23*4 = 97%
    });

    await Promise.all(loadPromises);
    onProgress?.(100);
  }
}
```

### 3.2 추론 파이프라인

```typescript
async speak(text: string, options: SpeakOptions = {}): Promise<void> {
  const { voice = 'ko_F1', speed = 1.0 } = options;

  // 1. 텍스트 전처리
  const processedText = this.preprocessText(text);

  // 2. 청크 분할 (긴 문장 처리)
  const chunks = this.splitIntoChunks(processedText, 200);

  // 3. 각 청크 추론
  const audioChunks: Float32Array[] = [];
  for (const chunk of chunks) {
    const audio = await this.inferChunk(chunk, voice, speed);
    audioChunks.push(audio);
  }

  // 4. 오디오 병합 및 재생
  const fullAudio = this.concatenateAudio(audioChunks);
  await this.playAudio(fullAudio);
}

private async inferChunk(
  text: string,
  voice: string,
  speed: number
): Promise<Float32Array> {
  // Duration Prediction → Text Encoding → Vector Estimation → Vocoding
  const duration = await this.runSession('duration_predictor', { text });
  const encoded = await this.runSession('text_encoder', { text, duration });
  const vectors = await this.runSession('vector_estimator', { encoded, voice });
  const audio = await this.runSession('vocoder', { vectors, speed });

  return audio;
}
```

### 3.3 메모리 관리

```typescript
// 모델 언로드 (메모리 해제)
async dispose(): Promise<void> {
  for (const [name, session] of this.sessions) {
    await session.release();
  }
  this.sessions.clear();
  this.config = null;
}

// 사용 예: 세션 종료 시
useEffect(() => {
  return () => {
    if (!isSessionActive) {
      ttsEngine?.dispose();
    }
  };
}, [isSessionActive]);
```

### 3.4 성능 벤치마크 목표

| 메트릭 | 목표 | 측정 방법 |
|--------|------|----------|
| 모델 로딩 | < 10초 (캐시 후 < 2초) | Performance API |
| 첫 음성 출력 | < 500ms | speak() 호출 → 첫 오디오 |
| 실시간 계수 (RTF) | < 0.5 | 생성 시간 / 오디오 길이 |
| 메모리 사용 | < 500MB | Chrome DevTools |

---

## 🎨 4. UX 디자이너 관점

### 4.1 로딩 경험 설계

```
┌────────────────────────────────────────┐
│  음성 기능 준비 중...                    │
│  ████████████░░░░░░░░  60%             │
│                                         │
│  💡 잠시만 기다려주세요.                  │
│     음성으로 주문을 도와드릴게요.          │
└────────────────────────────────────────┘
```

**로딩 단계별 메시지:**
1. 0-25%: "음성 엔진을 불러오는 중..."
2. 25-75%: "AI 모델을 준비하는 중..."
3. 75-100%: "거의 완료되었어요!"

### 4.2 음성 선택 UI

```
┌────────────────────────────────────────┐
│  🎤 음성 설정                           │
│                                         │
│  ┌─────────┐  ┌─────────┐              │
│  │  👩 여성  │  │  👨 남성  │              │
│  │   F1    │  │   M1    │              │
│  └─────────┘  └─────────┘              │
│                                         │
│  🔊 ████████████░░░░  속도: 1.0x        │
└────────────────────────────────────────┘
```

### 4.3 에러 상태 처리

| 상황 | UI 피드백 | 동작 |
|------|----------|------|
| 모델 로딩 실패 | "음성 기능을 사용할 수 없습니다" | Web Speech 자동 전환 |
| 음성 생성 실패 | "다시 시도해주세요" | 재시도 버튼 표시 |
| 메모리 부족 | "기기 성능 문제" | 간단한 음성으로 전환 |

### 4.4 접근성 고려사항

- 로딩 중 `aria-busy="true"` 설정
- 음성 재생 중 시각적 표시 (파형 애니메이션)
- 음성 없이도 모든 기능 사용 가능 (터치 대체)

---

## 🚀 5. 인프라 엔지니어 관점

### 5.1 정적 파일 서빙 전략

```
public/tts/
├── onnx/                    # ~60-80MB total
│   ├── tts.json            # ~1KB (즉시 로드)
│   ├── duration_predictor.onnx   # ~5MB
│   ├── text_encoder.onnx         # ~20MB
│   ├── vector_estimator.onnx     # ~25MB
│   └── vocoder.onnx              # ~15MB
└── voice_styles/            # ~100KB total
    └── *.json
```

### 5.2 캐싱 전략

```typescript
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: '/tts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',  // 1년
          },
        ],
      },
    ];
  },
};
```

### 5.3 서비스 워커 프리캐싱

```typescript
// service-worker.js (선택적)
const TTS_CACHE = 'tts-models-v1';
const TTS_FILES = [
  '/tts/onnx/tts.json',
  '/tts/onnx/duration_predictor.onnx',
  '/tts/onnx/text_encoder.onnx',
  '/tts/onnx/vector_estimator.onnx',
  '/tts/onnx/vocoder.onnx',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(TTS_CACHE).then((cache) => cache.addAll(TTS_FILES))
  );
});
```

### 5.4 CDN 고려사항

| 호스팅 | CORS | 대용량 파일 | 권장 |
|--------|------|------------|------|
| Vercel | ✅ 자동 | ✅ Edge | ⭐ 권장 |
| Netlify | ✅ 설정 | ✅ LFS | 적합 |
| GitHub Pages | ⚠️ 제한 | ❌ 100MB | 부적합 |
| Cloudflare Pages | ✅ 자동 | ✅ R2 | 적합 |

### 5.5 번들 사이즈 영향

```
현재 번들:
├── onnxruntime-web    # 추가: ~2MB (gzipped)
└── 기타 변경 없음

런타임 다운로드:
└── TTS 모델           # ~60-80MB (최초 1회, 이후 캐시)
```

---

## 📅 6. 실행 계획

### Phase 1: 기반 구축 (1-2일)

| 작업 | 설명 | 담당 |
|------|------|------|
| 1.1 | onnxruntime-web 설치 및 설정 | FE |
| 1.2 | helper.js → TypeScript 포팅 | FE/ML |
| 1.3 | 모델 파일 다운로드 및 배치 | Infra |
| 1.4 | 기본 추론 테스트 | ML |

```bash
# 1.1 의존성 설치
npm install onnxruntime-web

# 1.3 모델 다운로드 (HuggingFace)
git clone https://huggingface.co/supertone-inc/supertonic-2
cp -r supertonic-2/onnx public/tts/
cp -r supertonic-2/voice_styles public/tts/
```

### Phase 2: 엔진 구현 (2-3일)

| 작업 | 설명 | 담당 |
|------|------|------|
| 2.1 | TTSEngine 인터페이스 정의 | Arch |
| 2.2 | SupertonicTTS 클래스 구현 | ML |
| 2.3 | WebSpeechTTS 래퍼 구현 | FE |
| 2.4 | 자동 폴백 로직 구현 | FE |

### Phase 3: 훅 통합 (1-2일)

| 작업 | 설명 | 담당 |
|------|------|------|
| 3.1 | useTextToSpeech 훅 확장 | FE |
| 3.2 | aiStore TTS 상태 확장 | FE |
| 3.3 | 기존 코드 호환성 테스트 | FE |

### Phase 4: UI/UX (1일)

| 작업 | 설명 | 담당 |
|------|------|------|
| 4.1 | 로딩 UI 컴포넌트 구현 | FE/UX |
| 4.2 | 음성 선택 UI (선택적) | FE/UX |
| 4.3 | 에러 상태 UI | FE/UX |

### Phase 5: 최적화 및 테스트 (1-2일)

| 작업 | 설명 | 담당 |
|------|------|------|
| 5.1 | 성능 벤치마크 | ML |
| 5.2 | 메모리 최적화 | ML |
| 5.3 | E2E 테스트 | QA |
| 5.4 | 캐싱 설정 확인 | Infra |

---

## ✅ 7. 체크리스트

### 구현 완료 조건

- [ ] Supertonic 모델 로딩 성공
- [ ] 한국어 TTS 음성 출력 동작
- [ ] Web Speech API 폴백 동작
- [ ] 기존 useTextToSpeech 인터페이스 호환
- [ ] 로딩 진행률 표시
- [ ] 에러 처리 및 폴백

### 성능 목표 달성

- [ ] 모델 로딩 < 10초 (첫 방문)
- [ ] 모델 로딩 < 2초 (캐시 후)
- [ ] 첫 음성 출력 < 500ms
- [ ] 메모리 사용 < 500MB

### 배포 준비

- [ ] 정적 파일 캐싱 설정
- [ ] 번들 사이즈 확인
- [ ] 브라우저 호환성 테스트 (Chrome, Edge, Safari)
- [ ] 모바일 테스트

---

## 📚 참고 자료

- [Supertonic GitHub](https://github.com/supertone-inc/supertonic)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript.html)
- [WebGPU Status](https://github.com/nicehorse06/webgpu-compatibility)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
