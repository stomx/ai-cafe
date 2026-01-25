/**
 * Echo Filter - TTS 음성이 마이크로 들어가는 것을 필터링
 *
 * 주의: 너무 엄격하면 실제 사용자 음성도 필터링됨
 * 가능하면 허용하는 방향으로 설계
 */

interface EchoFilterState {
  currentTTSText: string | null;
  ttsStartTime: number | null;
  ttsEndTime: number | null;
}

const state: EchoFilterState = {
  currentTTSText: null,
  ttsStartTime: null,
  ttsEndTime: null,
};

// TTS 에코 감지 윈도우 - 짧게 유지
const ECHO_WINDOW_MS = 800;

// 유사도 임계값 - 높게 설정하여 오탐 방지
const SIMILARITY_THRESHOLD = 0.7;

/**
 * TTS 시작 시 호출 - 현재 말하는 텍스트 저장
 */
export function onTTSStart(text: string): void {
  state.currentTTSText = text;
  state.ttsStartTime = Date.now();
  state.ttsEndTime = null;
  console.log('[EchoFilter] TTS started:', text.substring(0, 30) + '...');
}

/**
 * TTS 종료 시 호출
 */
export function onTTSEnd(): void {
  state.ttsEndTime = Date.now();
  console.log('[EchoFilter] TTS ended');

  // 에코 윈도우 후 상태 초기화
  setTimeout(() => {
    if (state.ttsEndTime && Date.now() - state.ttsEndTime >= ECHO_WINDOW_MS) {
      state.currentTTSText = null;
      state.ttsStartTime = null;
      state.ttsEndTime = null;
      console.log('[EchoFilter] State cleared');
    }
  }, ECHO_WINDOW_MS + 100);
}

/**
 * 텍스트 정규화 - 비교를 위해 공백/특수문자 제거
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?~\s]/g, '')
    .trim();
}

/**
 * STT 텍스트가 TTS 텍스트의 연속된 부분 문자열인지 확인
 * (에코는 보통 TTS의 일부분이 그대로 들어옴)
 */
function isSubstringOfTTS(sttText: string, ttsText: string): boolean {
  const stt = normalizeText(sttText);
  const tts = normalizeText(ttsText);

  if (stt.length === 0 || tts.length === 0) return false;

  // STT가 TTS의 연속 부분 문자열이고, 충분히 긴 경우만 에코로 판정
  // 최소 6자 이상이어야 에코로 판정 (너무 짧으면 우연의 일치일 수 있음)
  if (stt.length >= 6 && tts.includes(stt)) {
    // STT가 TTS의 상당 부분을 차지해야 에코
    const ratio = stt.length / tts.length;
    return ratio > 0.3; // TTS의 30% 이상이면 에코
  }

  return false;
}

export interface EchoCheckResult {
  isEcho: boolean;
  reason?: string;
  confidence: number;
}

/**
 * STT 결과가 TTS 에코인지 확인
 *
 * 설계 원칙: 의심스러우면 허용 (false negative보다 false positive가 나음)
 */
export function isEcho(sttText: string): EchoCheckResult {
  const normalized = normalizeText(sttText);

  // 빈 텍스트만 필터링
  if (normalized.length === 0) {
    return { isEcho: true, reason: 'empty', confidence: 1 };
  }

  // TTS가 활성 상태가 아니면 무조건 허용
  const isTTSActive = state.ttsStartTime !== null && (
    state.ttsEndTime === null ||
    Date.now() - state.ttsEndTime < ECHO_WINDOW_MS
  );

  if (!isTTSActive) {
    return { isEcho: false, reason: 'tts not active', confidence: 1 };
  }

  // TTS 텍스트가 없으면 허용
  if (!state.currentTTSText) {
    return { isEcho: false, reason: 'no tts text', confidence: 1 };
  }

  // 핵심 체크: STT가 TTS의 연속된 부분 문자열인지
  if (isSubstringOfTTS(sttText, state.currentTTSText)) {
    return {
      isEcho: true,
      reason: 'substring of TTS',
      confidence: 0.9
    };
  }

  // 높은 유사도 체크 (70% 이상만)
  const ttsNorm = normalizeText(state.currentTTSText);
  if (normalized.length >= 6) {
    // 긴 텍스트의 경우 연속 매칭 체크
    let maxMatch = 0;
    for (let i = 0; i <= ttsNorm.length - 6; i++) {
      for (let len = 6; len <= Math.min(normalized.length, ttsNorm.length - i); len++) {
        const substr = ttsNorm.substring(i, i + len);
        if (normalized.includes(substr)) {
          maxMatch = Math.max(maxMatch, len);
        }
      }
    }

    const matchRatio = maxMatch / normalized.length;
    if (matchRatio >= SIMILARITY_THRESHOLD) {
      return {
        isEcho: true,
        reason: `high match ratio (${Math.round(matchRatio * 100)}%)`,
        confidence: matchRatio
      };
    }
  }

  // 기본적으로 허용
  return { isEcho: false, reason: 'passed checks', confidence: 1 };
}

/**
 * 에코 필터 상태 초기화
 */
export function resetEchoFilter(): void {
  state.currentTTSText = null;
  state.ttsStartTime = null;
  state.ttsEndTime = null;
}
