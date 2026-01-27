import { NextRequest, NextResponse } from 'next/server';
import { SYSTEM_PROMPT, getUserPrompt, getOrderContext } from '@/lib/gemini/prompts';

const GEMINI_API_TIMEOUT = 5000;

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API key not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { transcript, currentItems, pendingClarification } = body;

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript is required' },
        { status: 400 }
      );
    }

    const context = getOrderContext(currentItems ?? [], pendingClarification);
    const userPrompt = getUserPrompt(transcript, context);
    const model = 'gemini-2.0-flash';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_API_TIMEOUT);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              topP: 0.8,
              topK: 40,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json',
            },
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Gemini API] Error:', response.status, errorText);
        return NextResponse.json(
          { error: `Gemini API error: ${response.status}` },
          { status: response.status }
        );
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return NextResponse.json(
          { error: 'Empty response from Gemini' },
          { status: 500 }
        );
      }

      // Parse the response
      const parsed = parseGeminiResponse(text);
      return NextResponse.json(parsed);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Gemini API timeout' },
          { status: 504 }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error('[Gemini API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

function parseGeminiResponse(text: string) {
  try {
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    const parsed = JSON.parse(jsonText);

    const validTypes = [
      'ADD_ITEM', 'REMOVE_ITEM', 'CHANGE_QUANTITY', 'CHANGE_TEMPERATURE',
      'MULTI_ACTION', 'CLEAR_ORDER', 'CONFIRM_ORDER', 'ASK_CLARIFICATION', 'UNKNOWN'
    ];

    if (!validTypes.includes(parsed.type)) {
      console.warn('[Gemini API] Invalid intent type:', parsed.type);
      return {
        type: 'UNKNOWN',
        confidence: 0,
        message: '의도를 파악할 수 없습니다.',
      };
    }

    return {
      type: parsed.type,
      items: parsed.items?.map((item: {
        menuId?: string;
        menuName?: string;
        temperature?: 'HOT' | 'ICE' | null;
        quantity?: number;
        action?: 'ADD' | 'REMOVE' | 'CHANGE_QUANTITY' | 'CHANGE_TEMPERATURE';
      }) => ({
        menuId: item.menuId || '',
        menuName: item.menuName || '',
        temperature: item.temperature ?? null,
        quantity: item.quantity || 1,
        action: item.action,
      })),
      message: parsed.message,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    };
  } catch (error) {
    console.error('[Gemini API] Parse error:', error, 'Text:', text);
    return {
      type: 'UNKNOWN',
      confidence: 0,
      message: 'JSON 파싱 실패',
    };
  }
}
