# AI Cafe

AI 기반 음성 인식 키오스크 시스템

> **100% 브라우저 로컬 AI** - 모든 AI 기능이 브라우저에서 무료로 동작합니다.

## Quick Start

```bash
# 1. 저장소 클론
git clone https://github.com/your-org/ai-cafe.git
cd ai-cafe

# 2. 의존성 설치
npm install

# 3. 개발 서버 실행
npm run dev

# 4. 브라우저에서 열기
# http://localhost:3000
```

## 주요 기능

| 기능 | 설명 | 기술 |
|------|------|------|
| Face Detection | 얼굴 인식 시 자동 인사 | MediaPipe + TensorFlow.js |
| STT | 음성으로 주문 접수 | Whisper (Transformers.js) |
| TTS | 음성으로 안내 | Supertonic (ONNX) |
| LLM | 자연어 주문 처리 | WebLLM (Qwen) |

## 시나리오

```
1. 고객 접근 → 얼굴 인식 → 자동 인사 + 메뉴 표시
2. 음성/터치로 주문: "아이스 아메리카노 2개 주세요"
3. AI가 주문 확인: "아이스 아메리카노 2잔, 9,000원입니다"
4. 음성/터치로 수정 가능
5. 주문 확정 → 대기열 등록
6. 준비 완료 → 픽업 대기열 이동
```

## 시스템 요구사항

| 요구사항 | 최소 | 권장 |
|----------|------|------|
| 브라우저 | Chrome/Edge 113+ | 최신 버전 |
| GPU | WebGPU 지원 | 4GB+ VRAM |
| RAM | 8GB | 16GB |
| Node.js | 18+ | 20+ |

## 기술 스택

### Frontend
- **Framework:** Next.js 14 (App Router)
- **UI:** React 18 + Tailwind CSS
- **State:** Zustand
- **Language:** TypeScript

### AI (100% Browser Local)
| Feature | Library | Size |
|---------|---------|------|
| Face Detection | MediaPipe + TensorFlow.js | ~3MB |
| STT | Whisper via Transformers.js | ~250MB |
| TTS | Supertonic (ONNX) | ~70MB |
| LLM | WebLLM + Qwen2.5-1.5B | ~1GB |

> 자세한 기술 결정 내용은 [TECH-STACK.md](./docs/TECH-STACK.md) 참조

## 개발 환경 설정

### Prerequisites
- Node.js 18+ (권장: 20+)
- npm 또는 yarn
- Chrome/Edge (WebGPU 지원 브라우저)
- 8GB+ RAM (권장: 16GB)

### 설치 및 실행

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build
npm start
```

### 중요: COOP/COEP 헤더

SharedArrayBuffer 사용을 위해 다음 헤더가 필요합니다:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

## 프로젝트 구조

```
ai-cafe/
├── src/
│   ├── app/              # Next.js App Router
│   ├── components/       # React 컴포넌트
│   │   ├── header/       # 헤더 (AI 상태 표시)
│   │   ├── menu/         # 메뉴 섹션
│   │   ├── order/        # 주문 섹션
│   │   └── queue/        # 대기열 섹션
│   ├── hooks/            # Custom hooks
│   │   ├── useSTT.ts     # 음성 인식
│   │   ├── useTTS.ts     # 음성 합성
│   │   ├── useLLM.ts     # LLM 처리
│   │   └── useFaceDetection.ts
│   ├── store/            # Zustand stores
│   │   ├── kioskStore.ts # 키오스크 상태 머신
│   │   ├── orderStore.ts # 주문 상태
│   │   ├── queueStore.ts # 대기열 상태
│   │   └── aiStore.ts    # AI 모델 상태
│   ├── workers/          # Web Workers
│   ├── lib/ai/           # AI 모델 통합
│   └── data/             # 정적 메뉴 데이터
├── docs/                 # 문서
├── CLAUDE.md             # AI 어시스턴트용 컨텍스트
└── README.md
```

## 비용

| 구분 | API 기반 | 브라우저 기반 (현재) |
|------|---------|---------------------|
| 월 비용 | $210+ | **$0** |
| 연간 절감 | - | **$2,520** |

## 문서

- [기술 스택 결정 문서](./docs/TECH-STACK.md)
- [구현 계획서](./docs/IMPLEMENTATION-PLAN.md)
- [UI 설계서](./docs/UI-DESIGN.md)
- [CLAUDE.md](./CLAUDE.md) - AI 어시스턴트용 프로젝트 컨텍스트

## License

MIT
