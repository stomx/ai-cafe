/**
 * Cloudflare Pages Function for Gemini API
 * Endpoint: /api/gemini
 */

interface Env {
  GEMINI_API_KEY: string;
}

interface MenuItem {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  price: number;
  temperatures: string[];
  available: boolean;
}

// 메뉴 데이터 (src/data/menu.ts와 동기화 필요)
const menuItems: MenuItem[] = [
  // Coffee
  { id: 'americano', name: '아메리카노', nameEn: 'Americano', category: 'coffee', price: 4500, temperatures: ['HOT', 'ICE'], available: true },
  { id: 'cafe-latte', name: '카페라떼', nameEn: 'Cafe Latte', category: 'coffee', price: 5000, temperatures: ['HOT', 'ICE'], available: true },
  { id: 'vanilla-latte', name: '바닐라라떼', nameEn: 'Vanilla Latte', category: 'coffee', price: 5500, temperatures: ['HOT', 'ICE'], available: true },
  { id: 'caramel-macchiato', name: '카라멜 마키아토', nameEn: 'Caramel Macchiato', category: 'coffee', price: 5500, temperatures: ['HOT', 'ICE'], available: true },
  { id: 'hazelnut-latte', name: '헤이즐넛라떼', nameEn: 'Hazelnut Latte', category: 'coffee', price: 5500, temperatures: ['HOT', 'ICE'], available: true },
  { id: 'cold-brew', name: '콜드브루', nameEn: 'Cold Brew', category: 'coffee', price: 5000, temperatures: ['ICE'], available: true },
  { id: 'espresso', name: '에스프레소', nameEn: 'Espresso', category: 'coffee', price: 3500, temperatures: ['HOT'], available: true },
  { id: 'cappuccino', name: '카푸치노', nameEn: 'Cappuccino', category: 'coffee', price: 5000, temperatures: ['HOT'], available: true },
  // Non-Coffee
  { id: 'green-tea-latte', name: '녹차라떼', nameEn: 'Green Tea Latte', category: 'non-coffee', price: 5500, temperatures: ['HOT', 'ICE'], available: true },
  { id: 'chocolate-latte', name: '초코라떼', nameEn: 'Chocolate Latte', category: 'non-coffee', price: 5500, temperatures: ['HOT', 'ICE'], available: true },
  { id: 'matcha-latte', name: '말차라떼', nameEn: 'Matcha Latte', category: 'non-coffee', price: 6000, temperatures: ['HOT', 'ICE'], available: true },
  { id: 'milk-tea', name: '밀크티', nameEn: 'Milk Tea', category: 'non-coffee', price: 5000, temperatures: ['HOT', 'ICE'], available: true },
  { id: 'strawberry-latte', name: '딸기라떼', nameEn: 'Strawberry Latte', category: 'non-coffee', price: 6000, temperatures: ['ICE'], available: true },
  { id: 'orange-juice', name: '오렌지주스', nameEn: 'Orange Juice', category: 'non-coffee', price: 5500, temperatures: ['ICE'], available: true },
  // Dessert
  { id: 'croissant', name: '크루아상', nameEn: 'Croissant', category: 'dessert', price: 4000, temperatures: [], available: true },
  { id: 'chocolate-cake', name: '초코케이크', nameEn: 'Chocolate Cake', category: 'dessert', price: 6500, temperatures: [], available: true },
  { id: 'cheesecake', name: '치즈케이크', nameEn: 'Cheesecake', category: 'dessert', price: 6500, temperatures: [], available: true },
  { id: 'tiramisu', name: '티라미수', nameEn: 'Tiramisu', category: 'dessert', price: 7000, temperatures: [], available: true },
  // Seasonal
  { id: 'pumpkin-latte', name: '펌킨라떼', nameEn: 'Pumpkin Latte', category: 'seasonal', price: 6500, temperatures: ['HOT', 'ICE'], available: true },
  { id: 'strawberry-ade', name: '딸기에이드', nameEn: 'Strawberry Ade', category: 'seasonal', price: 6000, temperatures: ['ICE'], available: true },
];

// 메뉴 목록을 프롬프트용 문자열로 변환
function getMenuListForPrompt(): string {
  return menuItems
    .filter((item) => item.available)
    .map((item) => {
      const temps = item.temperatures.length > 0
        ? item.temperatures.join('/')
        : '없음';
      return `- ID: ${item.id}, 이름: ${item.name}, 영문: ${item.nameEn}, 온도: ${temps}, 가격: ${item.price}원`;
    })
    .join('\n');
}

// Gemini 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 카페 키오스크 AI입니다.
사용자의 음성을 분석하여 주문 의도를 JSON으로 반환하세요.

## 메뉴 목록
${getMenuListForPrompt()}

## 응답 포맷 (반드시 JSON만 출력)
{
  "type": "ADD_ITEM" | "REMOVE_ITEM" | "CHANGE_QUANTITY" | "CHANGE_TEMPERATURE" | "MULTI_ACTION" | "CLEAR_ORDER" | "CONFIRM_ORDER" | "ASK_CLARIFICATION" | "UNKNOWN",
  "items": [
    {
      "menuId": "메뉴 ID",
      "menuName": "메뉴 이름",
      "temperature": "HOT" | "ICE" | null,
      "quantity": 숫자,
      "action": "ADD" | "REMOVE" | "CHANGE_QUANTITY" | "CHANGE_TEMPERATURE"
    }
  ],
  "message": "명확화가 필요한 경우 질문 메시지",
  "confidence": 0.0~1.0
}

**action 필드 규칙**:
- 단일 의도 (ADD_ITEM, REMOVE_ITEM 등): action 생략 가능
- 복합 명령 (MULTI_ACTION): 각 item에 action 필수

## 의도 분류 규칙
1. **ADD_ITEM**: 메뉴 주문 요청
   - "아이스 아메리카노 주세요" → ADD_ITEM
   - "라떼 두 잔이요" → ADD_ITEM (quantity: 2)
   - "라떼 세 잔 아메리카노 두 잔" → ADD_ITEM, items: [{menuId: "latte", quantity: 3}, {menuId: "americano", quantity: 2}]
   - "그거 하나 더요" → 문맥 파악 필요, 불명확하면 ASK_CLARIFICATION

2. **REMOVE_ITEM**: 메뉴 삭제 요청
   - "아메리카노 빼주세요" → REMOVE_ITEM
   - "그거 취소요" → 문맥 파악 필요

3. **CHANGE_QUANTITY**: 수량 변경
   - "아메리카노 3잔으로 바꿔주세요" → CHANGE_QUANTITY (quantity: 3)

4. **CHANGE_TEMPERATURE**: 온도 변경
   - "아메리카노 아이스로 바꿔주세요" → CHANGE_TEMPERATURE

5. **CLEAR_ORDER**: 전체 주문 취소
   - "전부 취소해주세요" → CLEAR_ORDER
   - "처음부터 다시요" → CLEAR_ORDER

6. **CONFIRM_ORDER**: 주문 확정 (매우 엄격하게 적용!)
   - 반드시 명시적인 주문 완료 의도가 있어야 함
   - "주문할게요", "이대로 주문해주세요" → CONFIRM_ORDER
   - "결제할게요", "결제해줘", "결제해주세요" → CONFIRM_ORDER
   - "계산할게요", "계산해줘", "계산해주세요" → CONFIRM_ORDER
   - **절대 CONFIRM_ORDER가 아닌 경우**:
     - 메뉴 이름 + 수량 + 온도가 포함된 경우 → ADD_ITEM (예: "라떼 다섯잔, 따뜻하게")
     - 새로운 메뉴를 언급하는 경우 → ADD_ITEM
     - "다섯", "다섯잔" 등 수량 표현은 주문 완료가 아님!
     - **시스템 응답 에코 (절대 CONFIRM_ORDER 아님!)**:
       - "더 필요하신 게 있으신가요?" → UNKNOWN (시스템 질문의 에코)
       - "추가했습니다" → UNKNOWN (시스템 확인의 에코)
       - "온도를 선택해주세요" → UNKNOWN (시스템 안내의 에코)
       - 의문형 종결어미(-ㄴ가요, -ㄹ까요)로 끝나는 문장 → UNKNOWN (시스템 질문)

7. **ASK_CLARIFICATION**: 명확화 필요
   - 온도가 명시되지 않은 음료 주문 (HOT/ICE 둘 다 가능한 메뉴)
   - 메뉴명이 불명확한 경우
   - "그거", "아까 그거" 등 지시대명사만 있는 경우

8. **UNKNOWN**: 주문과 무관한 발화
   - "오늘 날씨 어때?" → UNKNOWN

9. **MULTI_ACTION**: 복합 명령 (여러 동작이 섞인 경우)
   - "아메리카노 두 잔으로, 라떼는 세 잔으로 바꿔줘" → MULTI_ACTION, items: [{menuId: "americano", quantity: 2, action: "CHANGE_QUANTITY"}, {menuId: "cafe-latte", quantity: 3, action: "CHANGE_QUANTITY"}]
   - "아메리카노 추가하고 라떼 빼줘" → MULTI_ACTION, items: [{..., action: "ADD"}, {..., action: "REMOVE"}]
   - "아메리카노 아이스로 바꾸고 라떼 두 잔 추가해줘" → MULTI_ACTION, items: [{..., action: "CHANGE_TEMPERATURE"}, {..., action: "ADD"}]
   - 동일한 동작(모두 추가, 모두 변경)이면 해당 단일 타입 사용, 다른 동작이 섞이면 MULTI_ACTION

## 온도 처리 규칙
- 명시적 온도 언급: "아이스", "차가운", "시원한" → ICE / "핫", "따뜻한", "뜨거운" → HOT
- 온도 미지정 + HOT/ICE 둘 다 가능 → temperature: null, type: ASK_CLARIFICATION, message에 온도 질문
- 온도 미지정 + 단일 온도만 가능 → 해당 온도 자동 선택
- 디저트 등 온도 없는 메뉴 → temperature: null (ASK_CLARIFICATION 아님)

## 수량 처리 규칙
- 수량 미지정 시 기본값 1
- 한글 수량 파싱: "한 잔"=1, "두 잔"=2, "세 잔"=3, "네 잔"=4, "다섯 잔"=5...
- 숫자+단위: "2잔", "3개" 등
- **복수 메뉴 주문 시 각 메뉴에 명시된 수량을 정확히 배분** (매우 중요!)
  - "라떼 세 잔 아메리카노 두 잔" → 라떼 quantity: 3, 아메리카노 quantity: 2
  - "아메리카노 두 잔하고 라떼 하나" → 아메리카노 quantity: 2, 라떼 quantity: 1
  - "커피 세 잔" → 해당 메뉴 quantity: 3

## 메뉴 매칭 규칙 (음성 인식 오류 보정 필수!)
음성 인식은 오류가 많습니다. 메뉴 목록에서 발음이 가장 유사한 메뉴를 찾아 매칭하세요.

**발음 유사도 매칭 (필수)**:
- "롯데", "랏떼", "라테", "하라떼", "카라떼" → 카페라떼
- "아매리카노", "아메라카노", "아멜리카노", "아매" → 아메리카노
- "카푸치도", "카푸지노" → 카푸치노
- "모카", "모까" → 카페모카
- "에스프래소", "에쓰프레소" → 에스프레소
- "콜브루", "콜드부루", "골드브루" → 콜드브루
- 자음/모음 1~2개 차이는 동일 메뉴로 간주

**매칭 우선순위**:
1. 정확한 이름 (아메리카노, 카페라떼)
2. 부분 일치 (아메 → 아메리카노, 라떼 → 카페라떼)
3. 발음 유사도 (롯데 → 라떼, 아매 → 아메리카노)

**매칭 불가 시**:
- 메뉴 목록에 유사한 메뉴가 전혀 없으면:
  - type: "UNKNOWN"
  - message: "죄송합니다. 해당 메뉴를 찾을 수 없습니다. 다시 말씀해주세요."
- ASK_CLARIFICATION은 온도 미지정이나 "그거" 같은 지시어일 때만 사용

## 중요 규칙
- JSON 외 다른 텍스트 출력 금지
- 확신도(confidence)는 의도 파악 정확도 (0.9 이상이면 확실)
- 주문과 무관한 잡담은 UNKNOWN 처리
`;

// 사용자 프롬프트 생성
function getUserPrompt(transcript: string, context?: string): string {
  let prompt = `사용자 음성: "${transcript}"`;

  if (context) {
    prompt += `\n\n현재 주문 상황:\n${context}`;
  }

  prompt += '\n\nJSON 응답:';
  return prompt;
}

// 주문 컨텍스트 생성
function getOrderContext(
  currentItems: Array<{ name: string; temperature: string | null; quantity: number }>,
  pendingClarification?: { menuName: string; question: string }
): string {
  const lines: string[] = [];

  if (currentItems.length > 0) {
    lines.push('현재 주문 목록:');
    for (const item of currentItems) {
      const tempStr = item.temperature ? ` (${item.temperature})` : '';
      lines.push(`- ${item.name}${tempStr} ${item.quantity}잔`);
    }
  } else {
    lines.push('현재 주문 목록: 없음');
  }

  if (pendingClarification) {
    lines.push(`\n대기 중인 질문: "${pendingClarification.question}" (메뉴: ${pendingClarification.menuName})`);
  }

  return lines.join('\n');
}

// Gemini 응답 파싱
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
      items: parsed.items?.map((item: any) => ({
        menuId: item.menuId || '',
        menuName: item.menuName || '',
        temperature: item.temperature ?? null,
        quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
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

// Cloudflare Pages Function - POST 핸들러
export async function onRequestPost(context: any) {
  try {
    const { request, env } = context;
    const apiKey = env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Gemini API key not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { transcript, currentItems, pendingClarification } = body;

    if (!transcript) {
      return new Response(
        JSON.stringify({ error: 'Transcript is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const orderContext = getOrderContext(currentItems ?? [], pendingClarification);
    const userPrompt = getUserPrompt(transcript, orderContext);
    const model = 'gemini-2.0-flash';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

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
        return new Response(
          JSON.stringify({ error: `Gemini API error: ${response.status}` }),
          { status: response.status, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        return new Response(
          JSON.stringify({ error: 'Empty response from Gemini' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      console.log('[Gemini API] Raw response:', text);
      const parsed = parseGeminiResponse(text);
      console.log('[Gemini API] Parsed intent:', JSON.stringify(parsed, null, 2));
      return new Response(
        JSON.stringify(parsed),
        { headers: { 'Content-Type': 'application/json' } }
      );
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error?.name === 'AbortError') {
        return new Response(
          JSON.stringify({ error: 'Gemini API timeout' }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        );
      }

      throw error;
    }
  } catch (error) {
    console.error('[Gemini API] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
