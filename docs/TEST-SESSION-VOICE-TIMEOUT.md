# 세션 타이머 + 음성 입력 대기 테스트

## 요구사항

- **전체 세션 길이**: 45초
- **음성 입력 활성화 윈도우**: 처음 15초 (잔여 45초~31초)
- **15초 경과 (잔여 30초)**: 마이크 자동 비활성화 + 안내 메시지
- **35초 경과 (잔여 10초)**: 세션 종료 임박 경고
- **45초 경과 (잔여 0초)**: 스플래시 화면으로 복귀

## 구현 로직

```typescript
// page.tsx
const VOICE_TIMEOUT = 30; // 음성 입력 종료 시점 (세션 잔여 시간 기준, 초)
const SESSION_WARNING = 10; // 세션 종료 임박 경고 (초)

// 잔여 30초 이하가 되면 음성 입력 대기 종료
useEffect(() => {
  if (isSessionActive && sessionTimeLeft <= VOICE_TIMEOUT && isListening) {
    console.log(`[Page] Session time ${sessionTimeLeft}s <= ${VOICE_TIMEOUT}s, stopping voice input`);
    stopListening();
    if (!hasShownMicTimeoutRef.current) {
      hasShownMicTimeoutRef.current = true;
      const msg = '장시간 말씀이 없으셔서 마이크를 껐어요. 터치로 이어서 진행해주세요.';
      addAssistantResponse(msg);
      speakRef.current(msg);
    }
  }
}, [isSessionActive, sessionTimeLeft, isListening, stopListening, addAssistantResponse]);

// 잔여 10초 경고
useEffect(() => {
  if (isSessionActive && sessionTimeLeft === SESSION_WARNING && !hasShownSessionWarningRef.current) {
    hasShownSessionWarningRef.current = true;
    const msg = '곧 세션이 종료됩니다. 계속하시려면 화면을 터치해주세요.';
    addAssistantResponse(msg);
    speakRef.current(msg);
  }
}, [isSessionActive, sessionTimeLeft, addAssistantResponse]);
```

## 테스트 시나리오

### TC-01: 기본 동작 - 45초~31초 음성 대기 유지

**전제조건**: 세션 활성화, 음성 입력 활성화

| 단계 | 액션 | 예상 결과 |
|------|------|----------|
| 1 | 얼굴 인식 또는 시작하기 클릭 | 세션 시작 (45초) |
| 2 | 마이크 버튼 클릭하여 음성 입력 활성화 | 음성 입력 상태 (isListening: true) |
| 3 | 45초→31초 동안 대기 | 음성 입력 상태 유지됨 |
| 4 | 타이머가 31초일 때 확인 | 아직 음성 입력 활성화 상태 |

**확인 방법**: 콘솔에 `[Page] Session time ... stopping voice input` 로그가 안 나옴

---

### TC-02: 30초 도달 시 음성 입력 자동 종료 + 안내 메시지

**전제조건**: TC-01 상태에서 계속

| 단계 | 액션 | 예상 결과 |
|------|------|----------|
| 1 | 타이머가 30초가 되는 순간 | 음성 입력 자동 종료 |
| 2 | TTS 확인 | "장시간 말씀이 없으셔서 마이크를 껐어요..." 음성 출력 |
| 3 | 채팅 UI 확인 | 안내 메시지 표시 |
| 4 | 마이크 아이콘 확인 | 비활성화 상태로 변경 |

**확인 방법**: 콘솔에 `[Page] Session time 30s <= 30s, stopping voice input` 로그 출력

---

### TC-03: 10초 도달 시 세션 종료 경고

**전제조건**: 세션 활성화, 음성 입력 비활성화

| 단계 | 액션 | 예상 결과 |
|------|------|----------|
| 1 | 타이머가 10초가 되는 순간 | 경고 메시지 출력 |
| 2 | TTS 확인 | "곧 세션이 종료됩니다..." 음성 출력 |
| 3 | 채팅 UI 확인 | 경고 메시지 표시 |

**확인 방법**: 콘솔에 `[Page] Session warning at 10s` 로그 출력

---

### TC-04: 화면 터치로 타이머 리셋

**전제조건**: 타이머 10초 이하, 경고 표시된 상태

| 단계 | 액션 | 예상 결과 |
|------|------|----------|
| 1 | 화면 아무 곳이나 터치 | 타이머 45초로 리셋 |
| 2 | 경고 플래그 리셋 | 10초 도달 시 다시 경고 가능 |
| 3 | 마이크 버튼 클릭 | 음성 입력 다시 활성화 가능 |

---

### TC-05: 세션 타임아웃 (0초 도달)

**전제조건**: 세션 활성화, 아무 활동 없음

| 단계 | 액션 | 예상 결과 |
|------|------|----------|
| 1 | 45초 대기 | 타이머 0초 도달 |
| 2 | 타임아웃 콜백 실행 | 세션 초기화 |
| 3 | UI 확인 | 스플래시 화면으로 복귀 |
| 4 | 상태 확인 | 주문 목록 초기화, 채팅 초기화 |

**확인 방법**: 콘솔에 `[Page] Session timeout - returning to splash` 로그 출력

---

### TC-06: 터치 시 음성 입력 비활성화

**전제조건**: 음성 입력 활성화 상태

| 단계 | 액션 | 예상 결과 |
|------|------|----------|
| 1 | 메뉴 아이템 터치 | 음성 입력 즉시 종료 |
| 2 | 안내 메시지 확인 | 안내 없음 (조용히 종료) |
| 3 | 타이머 확인 | 45초로 리셋됨 |

---

### TC-07: TTS 에코 필터링

**전제조건**: 음성 입력 활성화, TTS 재생 중

| 단계 | 액션 | 예상 결과 |
|------|------|----------|
| 1 | AI가 응답 중 (TTS 재생) | - |
| 2 | TTS 소리가 마이크에 들어감 | 에코로 감지됨 |
| 3 | STT 결과 처리 | 에코 필터에 의해 무시됨 |
| 4 | 타이머 확인 | 리셋되지 않음 (에코이므로) |

**확인 방법**: 콘솔에 `[Echo Filter] Filtered:` 로그 출력

---

## 엣지 케이스

### EC-01: 경계값 테스트

| 잔여 시간 | 음성 입력 | 예상 동작 |
|----------|----------|----------|
| 31초 | 활성화 | 유지됨 |
| 30초 | 활성화 | **종료됨 + 안내** |
| 29초 | 비활성화 | 유지 (이미 꺼짐) |
| 10초 | - | **경고 메시지** |
| 0초 | - | **스플래시 복귀** |

### EC-02: 빠른 활동 전환

1. 음성 입력 활성화 (40초)
2. 메뉴 터치 (타이머 리셋 → 45초, 음성 비활성화)
3. 다시 마이크 클릭 → 음성 입력 유지되어야 함

### EC-03: 중복 안내 방지

1. 30초 도달 → 마이크 비활성화 안내 (1회)
2. 터치로 리셋 (45초)
3. 다시 30초 도달 → 마이크 비활성화 안내 (1회) - 중복 없음

---

## 콘솔 로그 확인 목록

```
[Page] Session time 30s <= 30s, stopping voice input  // TC-02
[Page] Session warning at 10s                         // TC-03
[Page] Session timeout - returning to splash          // TC-05
[Echo Filter] Filtered: ...                           // TC-07
```

---

## 실행 방법

```bash
npm run dev
# 브라우저에서 http://localhost:3000 접속
# DevTools 콘솔 열기 (F12)
# 각 테스트 케이스 수동 실행
```
