import type { OrderIntent } from './types';

const GEMINI_API_TIMEOUT = 6000; // 6초 타임아웃 (서버 5초 + 여유)

interface AnalyzeIntentOptions {
  currentItems?: Array<{ name: string; temperature: string | null; quantity: number }>;
  pendingClarification?: { menuName: string; question: string };
}

/**
 * API 라우트를 통해 Gemini로 음성 입력의 의도를 분석
 */
export async function analyzeIntent(
  transcript: string,
  options: AnalyzeIntentOptions = {}
): Promise<OrderIntent> {
  const { currentItems, pendingClarification } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_API_TIMEOUT);

  try {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript,
        currentItems,
        pendingClarification,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data as OrderIntent;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Gemini API timeout');
      }
      throw error;
    }

    throw new Error('Unknown error occurred');
  }
}

/**
 * Gemini API가 사용 가능한지 확인 (서버에서 설정 확인)
 * 클라이언트에서는 항상 true를 반환하고, 실제 가용성은 API 호출 시 확인
 */
export function isGeminiConfigured(): boolean {
  // 서버에서 API 키가 설정되어 있다고 가정
  // 실제 가용성은 API 호출 시 에러 처리로 확인
  return true;
}

/**
 * @deprecated Use API route instead
 */
export function getGeminiApiKey(): string | undefined {
  // 클라이언트에서는 더 이상 API 키에 접근하지 않음
  return undefined;
}
