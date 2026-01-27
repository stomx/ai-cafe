import { menuItems } from '@/data/menu';
import type { MenuItem } from '@/types/menu';

export interface MatchedOrder {
  menuItem: MenuItem;
  temperature: 'HOT' | 'ICE' | null;
  quantity: number;
  needsTemperatureConfirm?: boolean; // true if requested temp was not available
  requestedTemperature?: 'HOT' | 'ICE' | null; // original request (unavailable)
  availableTemperature?: 'HOT' | 'ICE'; // the only available option
}

export interface MatchResult {
  orders: MatchedOrder[];
  unmatched: string[];
  temperatureConflicts: MatchedOrder[]; // items where requested temp is unavailable
}

// ═══════════════════════════════════════════════════════════════════════════
// 음성인식 텍스트 보정 (Speech Recognition Correction)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 유사 발음/오타 보정 매핑
 * key: 잘못 인식될 수 있는 텍스트, value: 올바른 텍스트
 */
const SPEECH_CORRECTIONS: Record<string, string> = {
  // 콜드브루 변형
  '콜드 보러': '콜드브루',
  '콜드보러': '콜드브루',
  '콜드브로': '콜드브루',
  '콜드 브로': '콜드브루',
  '콜브루': '콜드브루',
  '콜드 부루': '콜드브루',
  '콜드부루': '콜드브루',
  '콜브로': '콜드브루',
  '콜드 불루': '콜드브루',

  // 아메리카노 변형
  '아메리카나': '아메리카노',
  '아멜리카노': '아메리카노',
  '아메리까노': '아메리카노',
  '어메리카노': '아메리카노',
  '아메라카노': '아메리카노',

  // 카페라떼 변형
  '라떼': '카페라떼',
  '라테': '카페라떼',
  '카페라테': '카페라떼',
  '카폐라떼': '카페라떼',
  '까페라떼': '카페라떼',
  '카페 라떼': '카페라떼',
  '카페 라테': '카페라떼',
  '카폐라테': '카페라떼',

  // 바닐라라떼 변형
  '바닐라라테': '바닐라라떼',
  '바닐라 라떼': '바닐라라떼',
  '바닐라 라테': '바닐라라떼',
  '바닐라떼': '바닐라라떼',
  '바닐라레떼': '바닐라라떼',

  // 카라멜 마키아토 변형
  '카라멜마키아토': '카라멜 마키아토',
  '카라멜 마끼아또': '카라멜 마키아토',
  '카라멜마끼아또': '카라멜 마키아토',
  '캬라멜 마키아토': '카라멜 마키아토',
  '카라맬 마키아토': '카라멜 마키아토',
  '마끼아또': '카라멜 마키아토',
  '마키아토': '카라멜 마키아토',
  '마키아또': '카라멜 마키아토',
  '마끼아토': '카라멜 마키아토',

  // 헤이즐넛라떼 변형
  '헤이즐넛라테': '헤이즐넛라떼',
  '헤이즐넛 라떼': '헤이즐넛라떼',
  '헤이즐렛 라떼': '헤이즐넛라떼',
  '헤즐넛라떼': '헤이즐넛라떼',
  '헤이즐럿라떼': '헤이즐넛라떼',

  // 카푸치노 변형
  '카프치노': '카푸치노',
  '까푸치노': '카푸치노',
  '카푸지노': '카푸치노',
  '카푸찌노': '카푸치노',
  '카프찌노': '카푸치노',

  // 에스프레소 변형
  '에스프레쏘': '에스프레소',
  '에스프래소': '에스프레소',
  '에스프레소오': '에스프레소',
  '엑스프레소': '에스프레소',

  // 녹차라떼 변형
  '녹차라테': '녹차라떼',
  '녹차 라떼': '녹차라떼',
  '녹차 라테': '녹차라떼',
  '녹찰라떼': '녹차라떼',

  // 초코라떼 변형
  '초코라테': '초코라떼',
  '초코 라떼': '초코라떼',
  '초콜릿 라떼': '초코라떼',
  '초콜릿라떼': '초코라떼',

  // 유자차 변형
  '유자 차': '유자차',
  '유자쨔': '유자차',

  // 딸기 스무디 변형
  '딸기스무디': '딸기 스무디',
  '딸기 쓰무디': '딸기 스무디',
  '딸기쓰무디': '딸기 스무디',

  // 망고 스무디 변형
  '망고스무디': '망고 스무디',
  '망고 쓰무디': '망고 스무디',
  '망고쓰무디': '망고 스무디',

  // 크로플 변형
  '크로푸': '크로플',
  '크로풀': '크로플',
  '크로플르': '크로플',

  // 티라미수 변형
  '티라미슈': '티라미수',
  '티라미쑤': '티라미수',
  '티라미스': '티라미수',

  // 치즈케이크 변형
  '치즈 케이크': '치즈케이크',
  '치즈게이크': '치즈케이크',
  '치즈게익': '치즈케이크',

  // 크루아상 변형
  '크로와상': '크루아상',
  '크로아상': '크루아상',
  '크루아쌍': '크루아상',
};

/**
 * Levenshtein 거리 계산 (편집 거리)
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 음성인식 텍스트를 보정합니다
 */
function correctSpeechText(text: string): string {
  let corrected = text;

  // 1. 직접 매핑된 보정 적용
  for (const [wrong, correct] of Object.entries(SPEECH_CORRECTIONS)) {
    const regex = new RegExp(wrong, 'gi');
    corrected = corrected.replace(regex, correct);
  }

  return corrected;
}

/**
 * 퍼지 매칭: 메뉴 이름과 유사한지 확인 (Levenshtein 거리 기반)
 */
function fuzzyMatchMenuItem(text: string, threshold: number = 2): MenuItem | null {
  const normalizedText = text.replace(/\s/g, '').toLowerCase();

  let bestMatch: MenuItem | null = null;
  let bestDistance = Infinity;

  for (const item of menuItems) {
    if (!item.available) continue;

    const itemNameNormalized = item.name.replace(/\s/g, '').toLowerCase();
    const distance = levenshteinDistance(normalizedText, itemNameNormalized);

    // 텍스트 길이에 비례한 threshold 적용
    const dynamicThreshold = Math.max(threshold, Math.floor(itemNameNormalized.length * 0.3));

    if (distance < bestDistance && distance <= dynamicThreshold) {
      bestDistance = distance;
      bestMatch = item;
    }
  }

  return bestMatch;
}

// Temperature keywords
const HOT_KEYWORDS = ['핫', '따뜻한', '따듯한', '뜨거운', '뜨뜻한', 'hot', '핫으로', '따뜻하게'];
const ICE_KEYWORDS = ['아이스', '차가운', '시원한', '얼음', 'ice', 'iced', '아이스로', '차갑게'];

// Build search index with variations
function buildMenuIndex(): Map<string, MenuItem> {
  const index = new Map<string, MenuItem>();

  for (const item of menuItems) {
    if (!item.available) continue;

    // Add exact name
    index.set(item.name.toLowerCase(), item);
    index.set(item.nameEn.toLowerCase(), item);

    // Add without spaces
    index.set(item.name.replace(/\s/g, '').toLowerCase(), item);

    // Add common variations
    const variations = generateVariations(item.name);
    for (const v of variations) {
      index.set(v.toLowerCase(), item);
    }
  }

  return index;
}

function generateVariations(name: string): string[] {
  const variations: string[] = [];

  // Common speech recognition variations
  const replacements: [RegExp, string][] = [
    [/라떼/g, '라테'],
    [/라테/g, '라떼'],
    [/마키아토/g, '마끼아또'],
    [/마끼아또/g, '마키아토'],
    [/카푸치노/g, '카프치노'],
    [/에스프레소/g, '에스프레쏘'],
    [/크루아상/g, '크로와상'],
    [/티라미수/g, '티라미슈'],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(name)) {
      variations.push(name.replace(pattern, replacement));
    }
  }

  return variations;
}

// Singleton index
let menuIndex: Map<string, MenuItem> | null = null;

function getMenuIndex(): Map<string, MenuItem> {
  if (!menuIndex) {
    menuIndex = buildMenuIndex();
  }
  return menuIndex;
}

/**
 * Extract temperature from text
 */
function extractTemperature(text: string): 'HOT' | 'ICE' | null {
  const lowerText = text.toLowerCase();

  for (const keyword of ICE_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return 'ICE';
    }
  }

  for (const keyword of HOT_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return 'HOT';
    }
  }

  return null;
}

/**
 * Extract quantity from text
 */
export function extractQuantity(text: string): number {
  // Normalize whitespace and remove common filler words
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  // Also check without any spaces for STT variations
  const noSpaceText = text.replace(/\s/g, '');

  // Korean native number patterns (check these first, more specific)
  // Order matters: check larger quantities first to avoid partial matches
  const koreanPatterns: Array<{ pattern: RegExp; value: number }> = [
    { pattern: /열\s*잔|열\s*개/, value: 10 },
    { pattern: /아홉\s*잔|아홉\s*개/, value: 9 },
    { pattern: /여덟\s*잔|여덟\s*개/, value: 8 },
    { pattern: /일곱\s*잔|일곱\s*개/, value: 7 },
    { pattern: /여섯\s*잔|여섯\s*개/, value: 6 },
    { pattern: /다섯\s*잔|다섯\s*개/, value: 5 },
    { pattern: /네\s*잔|네\s*개|넷/, value: 4 },
    { pattern: /세\s*잔|세\s*개|셋/, value: 3 },
    { pattern: /두\s*잔|두\s*개|둘/, value: 2 },
    { pattern: /한\s*잔|한\s*개|하나/, value: 1 },
  ];

  for (const { pattern, value } of koreanPatterns) {
    if (pattern.test(normalizedText) || pattern.test(noSpaceText)) {
      return value;
    }
  }

  // Check for numeric patterns (2잔, 3개 등)
  const numMatch = normalizedText.match(/(\d+)\s*(잔|개|컵)/) || noSpaceText.match(/(\d+)(잔|개|컵)/);
  if (numMatch) {
    return parseInt(numMatch[1], 10);
  }

  // Check for standalone Korean number words
  const standalonePatterns: Array<{ pattern: RegExp; value: number }> = [
    { pattern: /열/, value: 10 },
    { pattern: /아홉/, value: 9 },
    { pattern: /여덟/, value: 8 },
    { pattern: /일곱/, value: 7 },
    { pattern: /여섯/, value: 6 },
    { pattern: /다섯/, value: 5 },
    { pattern: /넷/, value: 4 },
    { pattern: /셋/, value: 3 },
    { pattern: /둘/, value: 2 },
  ];

  for (const { pattern, value } of standalonePatterns) {
    if (pattern.test(normalizedText)) {
      return value;
    }
  }

  return 1; // Default to 1
}

/**
 * 텍스트에서 모든 수량을 위치 정보와 함께 추출 (순서대로)
 */
function extractAllQuantitiesWithPosition(text: string): Array<{ value: number; index: number }> {
  const quantities: Array<{ value: number; index: number }> = [];

  // 숫자 패턴 (2잔, 3개 등)
  const numPattern = /(\d+)\s*(잔|개|컵)/g;
  let match;
  while ((match = numPattern.exec(text)) !== null) {
    quantities.push({ value: parseInt(match[1], 10), index: match.index });
  }

  // 한글 수량 패턴
  const koreanPatterns: Array<{ pattern: RegExp; value: number }> = [
    { pattern: /한\s*잔|하나|한\s*개/g, value: 1 },
    { pattern: /두\s*잔|둘|두\s*개/g, value: 2 },
    { pattern: /세\s*잔|셋|세\s*개/g, value: 3 },
    { pattern: /네\s*잔|넷|네\s*개/g, value: 4 },
    { pattern: /다섯\s*잔|다섯|다섯\s*개/g, value: 5 },
  ];

  for (const { pattern, value } of koreanPatterns) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      quantities.push({ value, index: match.index });
    }
  }

  // 위치순으로 정렬
  quantities.sort((a, b) => a.index - b.index);

  return quantities;
}

/**
 * 텍스트에서 모든 수량을 추출 (순서대로 값만 반환)
 */
function extractAllQuantities(text: string): number[] {
  const withPos = extractAllQuantitiesWithPosition(text);
  if (withPos.length === 0) {
    return [1]; // 기본값 1
  }
  return withPos.map(q => q.value);
}

/**
 * Find menu item in text using fuzzy matching
 */
function findMenuItemInText(text: string): MenuItem | null {
  // First, apply speech correction
  const correctedText = correctSpeechText(text);
  const index = getMenuIndex();
  const lowerText = correctedText.toLowerCase().replace(/\s/g, '');

  // Try exact match first
  const entries = Array.from(index.entries());
  for (const [key, item] of entries) {
    const keyNoSpace = key.replace(/\s/g, '');
    if (lowerText.includes(keyNoSpace)) {
      return item;
    }
  }

  // Try partial match with menu names
  for (const item of menuItems) {
    if (!item.available) continue;

    const nameNoSpace = item.name.replace(/\s/g, '').toLowerCase();
    if (lowerText.includes(nameNoSpace)) {
      return item;
    }

    // Check English name
    const nameEnLower = item.nameEn.toLowerCase().replace(/\s/g, '');
    if (lowerText.includes(nameEnLower)) {
      return item;
    }
  }

  // Try fuzzy matching as fallback
  const fuzzyMatch = fuzzyMatchMenuItem(correctedText);
  if (fuzzyMatch) {
    console.log('[MenuMatcher] Fuzzy match found:', correctedText, '→', fuzzyMatch.name);
    return fuzzyMatch;
  }

  return null;
}

/**
 * Split input into segments, handling cases without explicit separators
 * e.g., "아이스 아메리카노 1잔 따뜻한 아메리카노 2잔" -> ["아이스 아메리카노 1잔", "따뜻한 아메리카노 2잔"]
 */
function splitIntoSegments(input: string): string[] {
  // First split by explicit separators
  const explicitSegments = input.split(/\s*(?:하고|이랑|그리고|랑|와|과|,|요\s+)\s*/);

  const allSegments: string[] = [];

  for (const segment of explicitSegments) {
    if (!segment.trim()) continue;

    // Try to split by temperature keywords (indicates new item)
    // Pattern: look for quantity/temperature patterns that indicate a new item
    // e.g., "1잔 따뜻한" or "한잔 아이스" suggests a break point
    const temperatureBreakPattern = /(\d+\s*잔|\d+\s*개|한\s*잔|두\s*잔|세\s*잔|하나|둘|셋)\s+(핫|따뜻한|따듯한|뜨거운|아이스|차가운|시원한)/g;

    let lastIndex = 0;
    let match;
    const subSegments: string[] = [];

    // Reset regex
    temperatureBreakPattern.lastIndex = 0;

    while ((match = temperatureBreakPattern.exec(segment)) !== null) {
      // Add everything up to and including the quantity
      const quantityEnd = match.index + match[1].length;
      if (quantityEnd > lastIndex) {
        const sub = segment.slice(lastIndex, quantityEnd).trim();
        if (sub) subSegments.push(sub);
      }
      // Start next segment from the temperature keyword
      lastIndex = quantityEnd;
    }

    // Add remaining text
    if (lastIndex < segment.length) {
      const remaining = segment.slice(lastIndex).trim();
      if (remaining) {
        if (subSegments.length > 0) {
          // Append to last segment if it exists
          subSegments[subSegments.length - 1] += ' ' + remaining;
        } else {
          subSegments.push(remaining);
        }
      }
    }

    // If no splits were made, keep original segment
    if (subSegments.length === 0) {
      allSegments.push(segment.trim());
    } else {
      allSegments.push(...subSegments.map(s => s.trim()).filter(s => s));
    }
  }

  return allSegments;
}

/**
 * Find all menu items in text (handles multiple mentions of same/different items)
 */
function findAllMenuItemsInText(text: string): Array<{ item: MenuItem; startIdx: number; endIdx: number }> {
  const found: Array<{ item: MenuItem; startIdx: number; endIdx: number }> = [];
  const correctedText = correctSpeechText(text);
  const lowerText = correctedText.toLowerCase();
  const lowerTextNoSpace = lowerText.replace(/\s/g, '');

  for (const item of menuItems) {
    if (!item.available) continue;

    const nameLower = item.name.toLowerCase();
    const nameNoSpace = item.name.replace(/\s/g, '').toLowerCase();

    // Try exact match with spaces first
    const idx = lowerText.indexOf(nameLower);
    if (idx !== -1) {
      found.push({
        item,
        startIdx: idx,
        endIdx: idx + nameLower.length,
      });
      continue;
    }

    // Try matching without spaces
    const noSpaceIdx = lowerTextNoSpace.indexOf(nameNoSpace);
    if (noSpaceIdx !== -1) {
      // Map back to original text position (approximate)
      // Count characters up to noSpaceIdx in the no-space version
      let origIdx = 0;
      let noSpaceCount = 0;
      while (noSpaceCount < noSpaceIdx && origIdx < lowerText.length) {
        if (lowerText[origIdx] !== ' ') {
          noSpaceCount++;
        }
        origIdx++;
      }

      // Find the end position
      let endOrigIdx = origIdx;
      let nameCount = 0;
      while (nameCount < nameNoSpace.length && endOrigIdx < lowerText.length) {
        if (lowerText[endOrigIdx] !== ' ') {
          nameCount++;
        }
        endOrigIdx++;
      }

      found.push({
        item,
        startIdx: origIdx,
        endIdx: endOrigIdx,
      });
    }
  }

  // Sort by position and remove duplicates
  found.sort((a, b) => a.startIdx - b.startIdx);

  // Remove overlapping matches (keep the first one)
  const filtered: Array<{ item: MenuItem; startIdx: number; endIdx: number }> = [];
  for (const f of found) {
    const overlaps = filtered.some(existing =>
      (f.startIdx >= existing.startIdx && f.startIdx < existing.endIdx) ||
      (f.endIdx > existing.startIdx && f.endIdx <= existing.endIdx)
    );
    if (!overlaps) {
      filtered.push(f);
    }
  }

  return filtered;
}

/**
 * Match voice input to menu items and return orders
 */
export function matchVoiceToMenu(voiceInput: string): MatchResult {
  const orders: MatchedOrder[] = [];
  const unmatched: string[] = [];
  const temperatureConflicts: MatchedOrder[] = [];

  // Normalize and correct speech recognition errors
  const normalizedInput = correctSpeechText(voiceInput.trim());
  console.log('[MenuMatcher] Original:', voiceInput, '→ Corrected:', normalizedInput);

  if (!normalizedInput) {
    return { orders, unmatched, temperatureConflicts };
  }

  // Find all menu items mentioned
  const foundItems = findAllMenuItemsInText(normalizedInput);

  // "각각" 패턴 감지 (예: "카페라떼 아메리카노 각각 2잔 3잔씩")
  const hasEachPattern = /각각|씩/.test(normalizedInput);

  const processItem = (menuItem: MenuItem, requestedTemp: 'HOT' | 'ICE' | null, quantity: number) => {
    const tempResolution = resolveTemperature(menuItem, requestedTemp);

    if (tempResolution.substituted) {
      // Temperature conflict - don't add, ask user
      temperatureConflicts.push({
        menuItem,
        temperature: null, // Not decided yet
        quantity,
        needsTemperatureConfirm: true,
        requestedTemperature: tempResolution.requested,
        availableTemperature: tempResolution.temperature as 'HOT' | 'ICE',
      });
    } else {
      orders.push({
        menuItem,
        temperature: tempResolution.temperature,
        quantity,
      });
    }
  };

  if (foundItems.length === 0) {
    // Try splitting into segments as fallback
    const segments = splitIntoSegments(normalizedInput);
    for (const segment of segments) {
      if (segment.trim().length > 1) {
        const menuItem = findMenuItemInText(segment);
        if (menuItem) {
          const requestedTemp = extractTemperature(segment);
          const quantity = extractQuantity(segment);
          processItem(menuItem, requestedTemp, quantity);
        } else {
          unmatched.push(segment.trim());
        }
      }
    }
    return { orders, unmatched, temperatureConflicts };
  }

  // "각각" 패턴일 때: 전체 텍스트에서 수량 추출 후 순서대로 매칭
  if (hasEachPattern && foundItems.length > 1) {
    const allQuantities = extractAllQuantities(normalizedInput);
    console.log(`[MenuMatcher] Each pattern detected. Items: ${foundItems.length}, Quantities: ${allQuantities.join(', ')}`);

    for (let i = 0; i < foundItems.length; i++) {
      const { item, startIdx } = foundItems[i];

      // 온도: 메뉴 이름 앞의 텍스트에서 추출
      const tempContextStart = i > 0 ? foundItems[i - 1].endIdx : 0;
      const tempContext = normalizedInput.slice(tempContextStart, startIdx);
      const requestedTemp = extractTemperature(tempContext);

      // 수량: 순서대로 매칭 (없으면 마지막 값 또는 1)
      const quantity = allQuantities[i] ?? allQuantities[allQuantities.length - 1] ?? 1;

      console.log(`[MenuMatcher] Item: ${item.name}, tempContext: "${tempContext}", requestedTemp: ${requestedTemp}, qty: ${quantity} (from each pattern)`);

      processItem(item, requestedTemp, quantity);
    }
  } else if (foundItems.length === 1) {
    // 단일 아이템: 전체 텍스트에서 온도와 수량 추출
    const { item } = foundItems[0];
    const requestedTemp = extractTemperature(normalizedInput);
    const quantity = extractQuantity(normalizedInput);

    console.log(`[MenuMatcher] Single item: ${item.name}, fullText: "${normalizedInput}", requestedTemp: ${requestedTemp}, qty: ${quantity}`);

    processItem(item, requestedTemp, quantity);
  } else {
    // 복수 아이템: 각 아이템의 주변 컨텍스트에서 수량 추출
    for (let i = 0; i < foundItems.length; i++) {
      const { item, startIdx, endIdx } = foundItems[i];

      // For temperature: look at text BEFORE the menu name (up to previous item or start)
      const tempContextStart = i > 0 ? foundItems[i - 1].endIdx : 0;
      const tempContext = normalizedInput.slice(tempContextStart, startIdx);

      // For quantity: look at text AFTER the menu name (up to next item or end)
      const qtyContextEnd = i < foundItems.length - 1 ? foundItems[i + 1].startIdx : normalizedInput.length;
      const qtyContextAfter = normalizedInput.slice(endIdx, qtyContextEnd);

      // Extract temperature from before, quantity from after (or before if not found after)
      const requestedTemp = extractTemperature(tempContext);
      let quantity = extractQuantity(qtyContextAfter);

      // If quantity is 1 (default), also check before the menu name
      if (quantity === 1) {
        const qtyFromBefore = extractQuantity(tempContext);
        if (qtyFromBefore > 1) {
          quantity = qtyFromBefore;
        }
      }

      console.log(`[MenuMatcher] Item: ${item.name}, tempContext: "${tempContext}", qtyContextAfter: "${qtyContextAfter}", requestedTemp: ${requestedTemp}, qty: ${quantity}`);

      processItem(item, requestedTemp, quantity);
    }
  }

  return { orders, unmatched, temperatureConflicts };
}

interface TemperatureResolution {
  temperature: 'HOT' | 'ICE' | null;
  substituted: boolean;
  requested: 'HOT' | 'ICE' | null;
}

/**
 * Resolve temperature based on menu item availability
 */
function resolveTemperature(menuItem: MenuItem, requested: 'HOT' | 'ICE' | null): TemperatureResolution {
  if (requested !== null) {
    // Validate the temperature is available
    if (menuItem.temperatures.includes(requested)) {
      return { temperature: requested, substituted: false, requested };
    }
    // Requested temperature not available, use what's available
    return {
      temperature: menuItem.temperatures[0] || null,
      substituted: true,
      requested,
    };
  }

  // No temperature specified
  if (menuItem.temperatures.length === 1) {
    return { temperature: menuItem.temperatures[0], substituted: false, requested: null };
  } else if (menuItem.temperatures.length > 1) {
    return { temperature: null, substituted: false, requested: null }; // Will trigger temperature selection modal
  }

  return { temperature: null, substituted: false, requested: null };
}

/**
 * Format matched orders as confirmation message
 */
export function formatOrderConfirmation(result: MatchResult): string {
  const messages: string[] = [];

  // Handle unmatched items first
  if (result.unmatched.length > 0) {
    messages.push(`"${result.unmatched.join(', ')}"은(는) 메뉴에 없어요. 메뉴판을 확인해주세요.`);
  }

  // Handle temperature conflicts - ask user to choose
  if (result.temperatureConflicts.length > 0) {
    for (const conflict of result.temperatureConflicts) {
      const requestedTempKo = conflict.requestedTemperature === 'ICE' ? '아이스' : '핫';
      const availableTempKo = conflict.availableTemperature === 'ICE' ? '아이스' : '핫';
      messages.push(
        `${conflict.menuItem.name}은 ${requestedTempKo}가 없어요. ${availableTempKo}으로 드릴까요, 아니면 다른 메뉴를 선택하시겠어요?`
      );
    }
  }

  // Separate orders: with temperature vs needing temperature selection
  const completedOrders = result.orders.filter(o => o.temperature !== null || o.menuItem.temperatures.length <= 1);
  const needsTempOrders = result.orders.filter(o => o.temperature === null && o.menuItem.temperatures.length > 1);

  // Handle successfully matched orders with temperature
  if (completedOrders.length > 0) {
    const orderLines = completedOrders.map(order => {
      const tempStr = order.temperature ? `(${order.temperature})` : '';
      const qtyStr = order.quantity > 1 ? ` ${order.quantity}잔` : '';
      return `${order.menuItem.name}${tempStr}${qtyStr}`;
    });

    messages.push(`${orderLines.join(', ')} 추가했어요.`);
  }

  // Ask about temperature for items that need it (only first one)
  if (needsTempOrders.length > 0) {
    const first = needsTempOrders[0];
    const qtyStr = first.quantity > 1 ? ` ${first.quantity}잔` : '';
    messages.push(`${first.menuItem.name}${qtyStr} 온도를 선택해주세요. 따뜻하게 또는 차갑게라고 말씀해주세요.`);
  }

  // Final prompt
  if (result.orders.length === 0 && result.temperatureConflicts.length === 0) {
    if (messages.length > 0) {
      return messages.join(' ');
    }
    return '주문하실 메뉴를 말씀해주세요.';
  }

  // 온도 선택이 필요한 항목이 있으면 이미 위에서 질문했으므로 "더 필요하신 게 있으신가요?" 생략
  if (needsTempOrders.length === 0 && result.temperatureConflicts.length === 0) {
    messages.push('더 필요하신 게 있으신가요?');
  }

  return messages.join(' ');
}
