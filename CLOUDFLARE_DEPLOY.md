# Cloudflare Pages 배포 가이드

## 1. Cloudflare Pages 프로젝트 생성

### 1.1 Cloudflare Dashboard 접속
1. [Cloudflare Dashboard](https://dash.cloudflare.com/) 로그인
2. **Workers & Pages** 메뉴 선택
3. **Create application** → **Pages** → **Connect to Git** 클릭

### 1.2 GitHub 연동
1. **GitHub 계정 연결** (최초 1회)
2. **stomx/ai-cafe** 리포지토리 선택
3. **Begin setup** 클릭

## 2. 빌드 설정

### 2.1 Build Configuration
```
Project name: ai-cafe (또는 원하는 이름)
Production branch: main
Build command: npm run build
Build output directory: out
Root directory: (leave empty)
```

### 2.2 Environment Variables
**Environment variables** 섹션에서 다음 환경 변수 추가:

| Variable Name | Value | Note |
|--------------|-------|------|
| `GEMINI_API_KEY` | `your-api-key` | [Google AI Studio](https://aistudio.google.com/app/apikey)에서 발급 |
| `NEXT_PUBLIC_TTS_CDN_URL` | `https://assets.stomx.net/tts/onnx` | TTS ONNX 모델 CDN URL |
| `NODE_VERSION` | `18` | (선택) Node.js 버전 명시 |

**주의**: ONNX 파일은 `assets.stomx.net` CDN에서 불러옵니다. Voice Styles JSON은 Git에 포함되어 있습니다.

## 3. 배포

### 3.1 첫 배포
1. **Save and Deploy** 클릭
2. 빌드 로그 확인 (약 2-3분 소요)
3. Git LFS 다운로드 확인:
   ```
   Cloning git repository...
   Downloading LFS objects...
   ✓ 4 LFS objects downloaded (250 MB)
   ```

### 3.2 배포 확인
빌드 완료 후 생성된 URL로 접속:
```
https://ai-cafe.pages.dev
```

## 4. 커스텀 도메인 설정 (선택)

### 4.1 ai-cafe.stomx.net 연결
1. Cloudflare Pages 프로젝트 → **Custom domains** 탭
2. **Set up a custom domain** 클릭
3. `ai-cafe.stomx.net` 입력
4. DNS 레코드 자동 추가 확인:
   ```
   Type: CNAME
   Name: ai-cafe
   Target: ai-cafe.pages.dev
   ```

### 4.2 도메인 적용 확인
- 설정 후 1-2분 내 적용
- HTTPS 인증서 자동 발급 (Let's Encrypt)

## 5. 배포 후 테스트

### 5.1 필수 확인 사항
1. **Gemini API 작동 확인**
   - 브라우저 개발자 도구 → Network 탭
   - 음성 주문 시 `/api/gemini` 요청 성공 (200 OK)

2. **TTS 파일 로드 확인**
   - Network 탭에서 다음 요청 성공 확인:
     - `https://assets.stomx.net/tts/onnx/tts.json` (200 OK, CORS 허용)
     - `/tts/voice_styles/F1.json` (200 OK, 로컬 파일)
   - Console에서 `[TTS] Failed to load Supertonic` 오류 없음

3. **COEP 헤더 확인**
   - Network 탭 → 응답 헤더:
     ```
     cross-origin-embedder-policy: credentialless
     cross-origin-opener-policy: same-origin
     ```
   - Google Analytics 차단 오류 없음

## 6. TTS CDN 설정 (assets.stomx.net)

### 6.1 CDN 구조
ONNX 모델 파일은 별도 CDN에서 제공됩니다:
```
https://assets.stomx.net/
└── tts/
    └── onnx/
        ├── duration_predictor.onnx (1.5MB)
        ├── text_encoder.onnx (26MB)
        ├── vector_estimator.onnx (126MB)
        ├── vocoder.onnx (97MB)
        ├── tts.json
        └── unicode_indexer.json
```

Voice Styles JSON 파일은 Git에 포함되어 있습니다:
```
public/tts/voice_styles/
├── F1.json
├── F2.json ~ F5.json
└── M1.json ~ M5.json
```

### 6.2 환경 변수 설정
Cloudflare Pages 환경 변수에 CDN URL 추가:
- `NEXT_PUBLIC_TTS_CDN_URL=https://assets.stomx.net/tts/onnx`

**장점**:
- ONNX 파일을 Git에 포함하지 않아도 됨 (250MB)
- GitHub LFS 대역폭 제한 회피
- CDN 캐싱으로 빠른 로딩
- 배포 시간 단축
- Voice Styles는 작은 JSON이므로 Git에 포함 (10개 파일, 각 ~300KB)

### 5.2 문제 해결

#### Gemini API 405 에러
```
POST /api/gemini 405 (Method Not Allowed)
```
**원인**: Functions가 배포되지 않음
**해결**:
1. Cloudflare Pages 빌드 로그 확인
2. `functions/api/gemini.ts` 파일이 빌드 출력에 포함되는지 확인
3. 빌드 재시도 (Deployments → Retry deployment)

#### TTS 파일 404 에러
```
GET /tts/onnx/tts.json 404 (Not Found)
```
**원인**: Git LFS 파일이 다운로드되지 않음
**해결**:
1. 환경 변수 `GIT_LFS_ENABLED=1` 설정 확인
2. 빌드 로그에서 "Downloading LFS objects" 확인
3. 로컬에서 `git lfs ls-files` 실행하여 ONNX 파일 추적 확인

#### COEP 차단 오류
```
ERR_BLOCKED_BY_RESPONSE.NotSameOriginAfterDefaultedToSameOriginByCoep
```
**원인**: COEP 헤더 설정 누락
**해결**:
1. `public/_headers` 파일이 배포에 포함되는지 확인
2. 브라우저 캐시 삭제 후 재시도
3. Cloudflare Pages 캐시 Purge (Settings → Functions → Purge cache)

## 6. 자동 배포 설정

### 6.1 GitHub Push 시 자동 배포
Cloudflare Pages는 기본적으로 GitHub `main` 브랜치에 push하면 자동 배포됩니다.

### 6.2 Preview Deployments
- Pull Request 생성 시 자동으로 Preview URL 생성
- PR 코멘트에 URL 자동 추가
- 브랜치별 독립적인 환경

## 7. Functions 로컬 테스트 (선택)

### 7.1 Wrangler 설치
```bash
npm install -g wrangler
```

### 7.2 로컬 환경 변수 설정
`.dev.vars` 파일 생성:
```bash
GEMINI_API_KEY=your-api-key
```

### 7.3 로컬 실행
```bash
# Next.js 개발 서버와 병행 실행
npm run dev  # http://localhost:3000

# Cloudflare Functions 로컬 테스트
npx wrangler pages dev out --compatibility-date=2024-01-01
```

## 8. 모니터링

### 8.1 배포 상태 확인
- Cloudflare Dashboard → Workers & Pages → ai-cafe
- **Deployments** 탭에서 빌드 히스토리 확인

### 8.2 실시간 로그
- Deployment 클릭 → **View build log**
- Functions 실행 로그는 **Functions** 탭에서 확인

### 8.3 Analytics
- **Analytics** 탭에서 트래픽, 요청 수, 오류율 확인
- Web Analytics 활성화로 사용자 행동 분석 가능

## 9. 비용

### 9.1 Cloudflare Pages 무료 플랜
- **빌드**: 500 빌드/월
- **대역폭**: 무제한
- **Functions**: 100,000 요청/일
- **Git LFS**: 무제한 (파일 크기 제한 없음)

### 9.2 Gemini API 비용
- **Gemini 2.0 Flash**: 무료 티어
  - 15 RPM (분당 요청)
  - 1,500 RPD (일당 요청)
  - 10,000 TPM (분당 토큰)

**예상 비용**: 0원 (무료 플랜 범위 내)

## 10. 주의사항

### 10.1 Git LFS 대역폭
- Cloudflare Pages는 Git LFS 대역폭을 무제한 제공
- GitHub LFS는 월 1GB 제한 있음 (초과 시 과금)
- Cloudflare가 LFS를 캐싱하므로 GitHub LFS 대역폭 소모 최소화

### 10.2 빌드 시간
- ONNX 파일 다운로드로 빌드 시간 증가 (약 2-3분)
- Git LFS 캐싱으로 재빌드 시 단축

### 10.3 환경 변수 보안
- `GEMINI_API_KEY`는 서버 사이드에서만 접근 가능
- 클라이언트에 노출되지 않음 (Functions 내부에서만 사용)

## 11. 트러블슈팅

### 11.1 빌드 실패
**증상**: `npm run build` 실패
**해결**:
```bash
# 로컬에서 빌드 테스트
npm run build

# 빌드 출력 확인
ls -la out/
```

### 11.2 Functions 404 에러
**증상**: `/api/gemini` 엔드포인트 없음
**해결**:
- `functions/api/gemini.ts` 파일 위치 확인
- Cloudflare Pages는 `/functions` 디렉토리를 자동 감지
- 파일명 확인: `gemini.ts` (`.js`가 아님)

### 11.3 메뉴 데이터 동기화
**주의**: `functions/api/gemini.ts`의 메뉴 데이터는 수동 동기화 필요
**자동화 방법**:
```bash
# 빌드 스크립트에서 메뉴 데이터 자동 복사
# package.json scripts에 추가:
"prebuild": "node scripts/sync-menu-data.js"
```

---

**참고 문서**:
- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Git LFS on Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/git-integration/#git-lfs)
- [COEP Headers Guide](https://web.dev/articles/coop-coep)
