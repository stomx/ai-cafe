'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useOrderStore } from '@/store/orderStore';
import type { OrderIntent } from '@/lib/gemini/types';
import { validateScenario, type TestValidationResult } from '@/utils/testValidator';

// 테스트 시나리오 타입
interface TestScenario {
  id: number;
  name: string;
  transcript: string;
  expectedIntent: string;
  expectedResult: string;
  initialOrder?: Array<{ menuId: string; temperature: 'HOT' | 'ICE' | null; quantity: number }>;
}

// 시스템 레벨 E2E 시나리오 타입
type SystemTestStep =
  | { type: 'face_detection' }
  | { type: 'text'; value: string }
  | { type: 'touch' }
  | { type: 'fast_forward'; seconds: number }
  | { type: 'wait'; ms: number }
  | { type: 'verify'; check: string };

interface SystemTestScenario {
  id: string;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  steps: SystemTestStep[];
  verifications: string[];
}

interface TestLog {
  timestamp: string;
  scenario: string;
  scenarioId?: number;
  transcript: string;
  intent: OrderIntent | null;
  success: boolean;
  message: string;
  error?: string;
  validation?: TestValidationResult;
}

interface QAControlPanelProps {
  onTranscriptSubmit: (transcript: string) => void;
  lastIntent?: OrderIntent | null;
  lastTTSMessage?: string;
  // 시스템 레벨 테스트용 props
  sessionTimer?: {
    isActive: boolean;
    timeLeft: number;
    startSession: () => void;
    stopSession: () => void;
    resetActivity: () => void;
    debugFastForward?: (seconds: number) => void;
  };
  onFaceDetected?: () => void;
  onTouchSimulate?: () => void;
  isMicActive?: boolean;
}

// 시스템 레벨 E2E 시나리오 정의
const SYSTEM_TEST_SCENARIOS: SystemTestScenario[] = [
  {
    id: 'TC-001',
    name: '기본 주문 플로우 (Happy Path)',
    difficulty: 'easy',
    description: '전체 주문 플로우가 정상 작동하는지 확인',
    steps: [
      { type: 'face_detection' },
      { type: 'wait', ms: 1000 },
      { type: 'text', value: '아이스 아메리카노 한 잔 주세요' },
      { type: 'wait', ms: 2000 },
      { type: 'text', value: '결제해줘' },
      { type: 'wait', ms: 2000 },
    ],
    verifications: ['세션 시작됨', '메뉴 추가됨', '주문 확정됨'],
  },
  {
    id: 'TC-002',
    name: '누락 정보 보완 (Multi-turn)',
    difficulty: 'medium',
    description: '온도 누락 시 명확화 질문 확인',
    steps: [
      { type: 'face_detection' },
      { type: 'wait', ms: 1000 },
      { type: 'text', value: '카페라떼 주세요' },
      { type: 'wait', ms: 2000 },
      { type: 'text', value: '따뜻한 거' },
      { type: 'wait', ms: 2000 },
    ],
    verifications: ['온도 질문 발생', '주문 완성됨'],
  },
  {
    id: 'TC-003',
    name: '복합 주문 (Multiple Items)',
    difficulty: 'hard',
    description: '한 문장에 여러 메뉴 분리 인식',
    steps: [
      { type: 'face_detection' },
      { type: 'wait', ms: 1000 },
      { type: 'text', value: '따뜻한 아메리카노 두 잔이랑 아이스 모카 한 잔 줘' },
      { type: 'wait', ms: 2000 },
    ],
    verifications: ['2개 이상 메뉴 추가됨'],
  },
  {
    id: 'TC-006',
    name: '주문 취소 및 초기화',
    difficulty: 'easy',
    description: '명시적 취소 요청 처리',
    steps: [
      { type: 'face_detection' },
      { type: 'wait', ms: 1000 },
      { type: 'text', value: '아이스 아메리카노 한 잔' },
      { type: 'wait', ms: 2000 },
      { type: 'text', value: '주문 다 취소할래' },
      { type: 'wait', ms: 2000 },
    ],
    verifications: ['장바구니 비워짐'],
  },
  {
    id: 'TC-007',
    name: '세션 타임아웃 (Auto Reset)',
    difficulty: 'easy',
    description: '자동 세션 종료 확인',
    steps: [
      { type: 'face_detection' },
      { type: 'wait', ms: 500 },
      { type: 'fast_forward', seconds: 15 },
      { type: 'verify', check: 'mic_disabled' },
      { type: 'wait', ms: 500 },
      { type: 'fast_forward', seconds: 30 },
      { type: 'verify', check: 'session_ended' },
    ],
    verifications: ['15초: 마이크 비활성화', '45초: 세션 종료'],
  },
  {
    id: 'TC-008',
    name: '화면 터치로 세션 연장',
    difficulty: 'medium',
    description: '마이크 비활성화 후 터치로 재활성화',
    steps: [
      { type: 'face_detection' },
      { type: 'wait', ms: 500 },
      { type: 'fast_forward', seconds: 20 },
      { type: 'verify', check: 'mic_disabled' },
      { type: 'touch' },
      { type: 'wait', ms: 500 },
      { type: 'verify', check: 'timer_reset' },
    ],
    verifications: ['터치 시 타이머 리셋', '마이크 재활성화'],
  },
];

// 음성 처리 테스트 시나리오 정의
const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 1,
    name: '단순 추가 - HOT 명시',
    transcript: '따뜻한 아메리카노 주세요',
    expectedIntent: 'ADD_ITEM',
    expectedResult: 'HOT 아메리카노 1잔 추가',
  },
  {
    id: 2,
    name: '단순 추가 - ICE 명시',
    transcript: '아이스 카페라떼 하나요',
    expectedIntent: 'ADD_ITEM',
    expectedResult: 'ICE 카페라떼 1잔 추가',
  },
  {
    id: 3,
    name: '단순 추가 - 온도 미명시',
    transcript: '바닐라라떼 주세요',
    expectedIntent: 'ADD_ITEM or ASK_CLARIFICATION',
    expectedResult: '온도 선택 모달 표시',
  },
  {
    id: 4,
    name: '단일 온도 메뉴 (ICE only)',
    transcript: '콜드브루 주세요',
    expectedIntent: 'ADD_ITEM',
    expectedResult: 'ICE 콜드브루 1잔 추가',
  },
  {
    id: 5,
    name: '단일 온도 메뉴 (HOT only)',
    transcript: '에스프레소 한 잔이요',
    expectedIntent: 'ADD_ITEM',
    expectedResult: 'HOT 에스프레소 1잔 추가',
  },
  {
    id: 6,
    name: '수량 지정 추가',
    transcript: '아이스 아메리카노 세 잔 주세요',
    expectedIntent: 'ADD_ITEM',
    expectedResult: 'ICE 아메리카노 3잔 추가',
  },
  {
    id: 7,
    name: '복수 메뉴 추가 - 온도 모두 명시',
    transcript: '따뜻한 카페라떼 두 잔하고 아이스 아메리카노 세 잔이요',
    expectedIntent: 'ADD_ITEM',
    expectedResult: 'HOT 카페라떼 2잔, ICE 아메리카노 3잔 추가',
  },
  {
    id: 8,
    name: '복수 메뉴 추가 - 일부 온도 미명시',
    transcript: '아이스 아메리카노 두 잔이랑 바닐라라떼 세 잔 주세요',
    expectedIntent: 'ADD_ITEM',
    expectedResult: '아메리카노 추가, 바닐라라떼 온도 질문',
  },
  {
    id: 9,
    name: '디저트 추가',
    transcript: '크루아상 두 개 주세요',
    expectedIntent: 'ADD_ITEM',
    expectedResult: '크루아상 2개 추가',
  },
  {
    id: 10,
    name: '메뉴 삭제',
    transcript: '아메리카노 빼주세요',
    expectedIntent: 'REMOVE_ITEM',
    expectedResult: '아메리카노 삭제',
    initialOrder: [{ menuId: 'americano', temperature: 'ICE', quantity: 2 }],
  },
  {
    id: 11,
    name: '수량 변경',
    transcript: '아메리카노 다섯 잔으로 바꿔주세요',
    expectedIntent: 'CHANGE_QUANTITY',
    expectedResult: '아메리카노 수량 5잔으로 변경',
    initialOrder: [{ menuId: 'americano', temperature: 'ICE', quantity: 2 }],
  },
  {
    id: 12,
    name: '온도 변경',
    transcript: '카페라떼 아이스로 바꿔주세요',
    expectedIntent: 'CHANGE_TEMPERATURE',
    expectedResult: '카페라떼 온도 ICE로 변경',
    initialOrder: [{ menuId: 'cafe-latte', temperature: 'HOT', quantity: 1 }],
  },
  {
    id: 13,
    name: '복합 명령 - 수량 여러 개',
    transcript: '아메리카노 두 잔으로, 카페라떼 세 잔으로 바꿔줘',
    expectedIntent: 'MULTI_ACTION',
    expectedResult: '아메리카노 2잔, 카페라떼 3잔으로 변경',
    initialOrder: [
      { menuId: 'americano', temperature: 'ICE', quantity: 1 },
      { menuId: 'cafe-latte', temperature: 'HOT', quantity: 1 },
    ],
  },
  {
    id: 14,
    name: '복합 명령 - 추가 + 삭제',
    transcript: '아이스 카페라떼 추가하고 아메리카노 빼줘',
    expectedIntent: 'MULTI_ACTION',
    expectedResult: '아메리카노 삭제, 카페라떼 추가',
    initialOrder: [{ menuId: 'americano', temperature: 'ICE', quantity: 2 }],
  },
  {
    id: 15,
    name: '복합 명령 - 온도 변경 + 추가',
    transcript: '아메리카노 아이스로 바꾸고 따뜻한 카페라떼 두 잔 추가해줘',
    expectedIntent: 'MULTI_ACTION',
    expectedResult: '아메리카노 ICE 변경, 카페라떼 2잔 추가',
    initialOrder: [{ menuId: 'americano', temperature: 'HOT', quantity: 1 }],
  },
  {
    id: 16,
    name: '전체 주문 취소',
    transcript: '전부 취소해주세요',
    expectedIntent: 'CLEAR_ORDER',
    expectedResult: '주문 전체 삭제',
    initialOrder: [
      { menuId: 'americano', temperature: 'ICE', quantity: 2 },
      { menuId: 'cafe-latte', temperature: 'HOT', quantity: 1 },
    ],
  },
  {
    id: 17,
    name: '주문 확정',
    transcript: '결제할게요',
    expectedIntent: 'CONFIRM_ORDER',
    expectedResult: '주문 확정',
    initialOrder: [
      { menuId: 'americano', temperature: 'ICE', quantity: 2 },
      { menuId: 'cafe-latte', temperature: 'HOT', quantity: 1 },
    ],
  },
  {
    id: 18,
    name: '음성 오인식 - 발음 유사',
    transcript: '아이스 롯데 두 잔이요',
    expectedIntent: 'ADD_ITEM',
    expectedResult: '카페라떼로 매칭, ICE 카페라떼 2잔 추가',
  },
  {
    id: 19,
    name: '음성 오인식 - 부분 매칭',
    transcript: '따뜻한 아매 하나요',
    expectedIntent: 'ADD_ITEM',
    expectedResult: '아메리카노로 매칭, HOT 아메리카노 1잔 추가',
  },
  {
    id: 20,
    name: '무관한 발화',
    transcript: '오늘 날씨 어때요?',
    expectedIntent: 'UNKNOWN',
    expectedResult: '주문 무관 응답',
  },
];

export default function QAControlPanel({
  onTranscriptSubmit,
  lastIntent,
  lastTTSMessage,
  sessionTimer,
  onFaceDetected,
  onTouchSimulate,
  isMicActive,
}: QAControlPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [currentTestId, setCurrentTestId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'voice' | 'system'>('voice');
  const [currentSystemTestId, setCurrentSystemTestId] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const orderItems = useOrderStore((state) => state.items);

  // 로그 자동 스크롤
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = useCallback((log: Omit<TestLog, 'timestamp'>) => {
    setLogs((prev) => [
      ...prev,
      {
        ...log,
        timestamp: new Date().toLocaleTimeString('ko-KR'),
      },
    ]);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transcript.trim()) return;

    addLog({
      scenario: 'Manual Input',
      transcript,
      intent: lastIntent ?? null,
      success: true,
      message: lastTTSMessage || 'Processing...',
    });

    onTranscriptSubmit(transcript);
    setTranscript('');
  };

  const runScenario = async (scenario: TestScenario) => {
    setCurrentTestId(scenario.id);

    // 초기 주문 상태 설정 (TODO: orderStore 초기화 함수 필요)
    // if (scenario.initialOrder) {
    //   // Set initial order state
    // }

    addLog({
      scenario: `[${scenario.id}] ${scenario.name}`,
      scenarioId: scenario.id,
      transcript: scenario.transcript,
      intent: null,
      success: false,
      message: 'Running...',
    });

    // 트랜스크립트 제출
    onTranscriptSubmit(scenario.transcript);

    // 결과 대기 및 검증
    await new Promise((resolve) => setTimeout(resolve, 2500));

    // 자동 검증 수행
    const validation = validateScenario(scenario.id, lastIntent ?? null, orderItems, lastTTSMessage);

    // 로그 업데이트
    setLogs((prev) => {
      const updated = [...prev];
      const lastLog = updated[updated.length - 1];
      if (lastLog && lastLog.scenarioId === scenario.id) {
        lastLog.success = validation.passed;
        lastLog.message = validation.passed
          ? '✓ 테스트 통과'
          : `✗ 실패: ${validation.errors.join(', ')}`;
        lastLog.validation = validation;
        lastLog.intent = lastIntent ?? null;
      }
      return updated;
    });

    setCurrentTestId(null);
  };

  const runAllTests = async () => {
    setIsRunningTests(true);
    setLogs([]); // 로그 초기화

    for (const scenario of TEST_SCENARIOS) {
      await runScenario(scenario);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // 테스트 간 딜레이
    }

    setIsRunningTests(false);
  };

  const clearLogs = () => {
    setLogs([]);
  };

  // 시스템 테스트 시나리오 실행
  const runSystemScenario = useCallback(async (scenario: SystemTestScenario) => {
    setCurrentSystemTestId(scenario.id);
    const startTime = Date.now();

    addLog({
      scenario: `[System] ${scenario.id}: ${scenario.name}`,
      transcript: scenario.description,
      intent: null,
      success: false,
      message: '🚀 시작...',
    });

    let stepIndex = 0;
    const errors: string[] = [];

    for (const step of scenario.steps) {
      stepIndex++;
      const stepLabel = `Step ${stepIndex}/${scenario.steps.length}`;

      try {
        switch (step.type) {
          case 'face_detection':
            if (onFaceDetected) {
              onFaceDetected();
              addLog({
                scenario: `${scenario.id} - ${stepLabel}`,
                transcript: '얼굴 감지 시뮬레이션',
                intent: null,
                success: true,
                message: '👤 얼굴 감지됨',
              });
            } else {
              errors.push('onFaceDetected 핸들러 없음');
            }
            break;

          case 'text':
            onTranscriptSubmit(step.value);
            addLog({
              scenario: `${scenario.id} - ${stepLabel}`,
              transcript: step.value,
              intent: null,
              success: true,
              message: '💬 텍스트 입력됨',
            });
            break;

          case 'touch':
            if (onTouchSimulate) {
              onTouchSimulate();
              addLog({
                scenario: `${scenario.id} - ${stepLabel}`,
                transcript: '화면 터치 시뮬레이션',
                intent: null,
                success: true,
                message: '👆 터치됨',
              });
            } else if (sessionTimer?.resetActivity) {
              sessionTimer.resetActivity();
              addLog({
                scenario: `${scenario.id} - ${stepLabel}`,
                transcript: '세션 리셋 (터치 대체)',
                intent: null,
                success: true,
                message: '👆 세션 리셋됨',
              });
            }
            break;

          case 'fast_forward':
            if (sessionTimer?.debugFastForward) {
              sessionTimer.debugFastForward(step.seconds);
              addLog({
                scenario: `${scenario.id} - ${stepLabel}`,
                transcript: `${step.seconds}초 빨리감기`,
                intent: null,
                success: true,
                message: `⏩ ${step.seconds}초 경과 (남은 시간: ${sessionTimer.timeLeft - step.seconds}초)`,
              });
            } else {
              errors.push('debugFastForward 지원 안 됨');
            }
            break;

          case 'wait':
            await new Promise((resolve) => setTimeout(resolve, step.ms));
            break;

          case 'verify':
            let verifyResult = false;
            let verifyMessage = '';

            switch (step.check) {
              case 'mic_disabled':
                verifyResult = isMicActive === false || (sessionTimer?.timeLeft ?? 45) <= 30;
                verifyMessage = verifyResult ? '✓ 마이크 비활성화 확인' : '✗ 마이크가 아직 활성화 상태';
                break;
              case 'session_ended':
                verifyResult = sessionTimer?.isActive === false;
                verifyMessage = verifyResult ? '✓ 세션 종료 확인' : '✗ 세션이 아직 활성화 상태';
                break;
              case 'timer_reset':
                verifyResult = (sessionTimer?.timeLeft ?? 0) >= 40;
                verifyMessage = verifyResult ? '✓ 타이머 리셋 확인' : '✗ 타이머가 리셋되지 않음';
                break;
            }

            if (!verifyResult) {
              errors.push(verifyMessage);
            }

            addLog({
              scenario: `${scenario.id} - ${stepLabel}`,
              transcript: `검증: ${step.check}`,
              intent: null,
              success: verifyResult,
              message: verifyMessage,
            });
            break;
        }
      } catch (error) {
        errors.push(`Step ${stepIndex} 에러: ${error}`);
      }
    }

    // 최종 결과
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const passed = errors.length === 0;

    setLogs((prev) => {
      const updated = [...prev];
      // 첫 번째 로그 업데이트
      const firstLog = updated.find((log) => log.scenario === `[System] ${scenario.id}: ${scenario.name}`);
      if (firstLog) {
        firstLog.success = passed;
        firstLog.message = passed
          ? `✅ 완료 (${elapsed}s)`
          : `❌ 실패: ${errors.join(', ')}`;
      }
      return updated;
    });

    setCurrentSystemTestId(null);
    return { passed, errors };
  }, [onFaceDetected, onTranscriptSubmit, onTouchSimulate, sessionTimer, isMicActive, addLog]);

  // 모든 시스템 테스트 실행
  const runAllSystemTests = async () => {
    setIsRunningTests(true);
    setLogs([]);

    for (const scenario of SYSTEM_TEST_SCENARIOS) {
      await runSystemScenario(scenario);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    setIsRunningTests(false);
  };

  // 테스트 통계 계산
  const testStats = {
    total: logs.filter((log) => log.validation).length,
    passed: logs.filter((log) => log.validation?.passed).length,
    failed: logs.filter((log) => log.validation && !log.validation.passed).length,
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-[9999] px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-lg shadow-lg hover:shadow-xl transition-all font-semibold"
      >
        🔧 QA Panel
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden border border-amber-500/30">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse" />
            <h2 className="text-2xl font-bold bg-gradient-to-r from-amber-400 to-yellow-300 bg-clip-text text-transparent">
              QA Control Panel
            </h2>
            {/* 탭 전환 */}
            <div className="flex gap-1 ml-4 bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('voice')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  activeTab === 'voice'
                    ? 'bg-amber-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                음성 ({TEST_SCENARIOS.length})
              </button>
              <button
                onClick={() => setActiveTab('system')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  activeTab === 'system'
                    ? 'bg-amber-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                시스템 ({SYSTEM_TEST_SCENARIOS.length})
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* 세션 상태 표시 */}
            {sessionTimer && (
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${sessionTimer.isActive ? 'bg-green-500' : 'bg-gray-500'}`} />
                <span className="text-gray-400">세션: {sessionTimer.isActive ? `${sessionTimer.timeLeft}초` : '비활성'}</span>
              </div>
            )}
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              닫기
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 p-6 max-h-[calc(90vh-80px)] overflow-hidden">
          {/* Left Column: Manual Input & Quick Tests */}
          <div className="space-y-4 overflow-y-auto">
            {/* Manual Input */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <h3 className="text-lg font-semibold mb-3 text-amber-400">수동 입력</h3>
              <form onSubmit={handleSubmit} className="space-y-3">
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  placeholder="음성 입력 시뮬레이션..."
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-amber-500 text-sm resize-none"
                  rows={3}
                />
                <button
                  type="submit"
                  disabled={!transcript.trim()}
                  className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
                >
                  전송
                </button>
              </form>
            </div>

            {/* Current State */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <h3 className="text-lg font-semibold mb-3 text-amber-400">현재 상태</h3>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-400">주문 항목:</span>
                  <span className="ml-2 text-white">{orderItems.length}개</span>
                </div>
                {lastIntent && (
                  <div>
                    <span className="text-gray-400">마지막 Intent:</span>
                    <span className="ml-2 px-2 py-1 bg-amber-900/50 text-amber-300 rounded text-xs">
                      {lastIntent.type}
                    </span>
                  </div>
                )}
                {lastTTSMessage && (
                  <div>
                    <span className="text-gray-400">TTS 메시지:</span>
                    <p className="mt-1 text-xs text-gray-300 bg-gray-900/50 p-2 rounded">
                      {lastTTSMessage}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Test Controls */}
            <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
              <h3 className="text-lg font-semibold mb-3 text-amber-400">테스트 제어</h3>
              <div className="space-y-2">
                {activeTab === 'voice' ? (
                  <button
                    onClick={runAllTests}
                    disabled={isRunningTests}
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
                  >
                    {isRunningTests ? '테스트 실행 중...' : '음성 테스트 전체 실행'}
                  </button>
                ) : (
                  <button
                    onClick={runAllSystemTests}
                    disabled={isRunningTests}
                    className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
                  >
                    {isRunningTests ? '테스트 실행 중...' : '시스템 테스트 전체 실행'}
                  </button>
                )}
                <button
                  onClick={clearLogs}
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  로그 초기화
                </button>
              </div>

              {/* Test Statistics */}
              {testStats.total > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-700/50">
                  <h4 className="text-sm font-semibold mb-2 text-amber-300">테스트 통계</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">총 테스트:</span>
                      <span className="text-white font-medium">{testStats.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">통과:</span>
                      <span className="text-green-400 font-medium">{testStats.passed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">실패:</span>
                      <span className="text-red-400 font-medium">{testStats.failed}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-700/30">
                      <span className="text-gray-400">성공률:</span>
                      <span className={`font-bold ${testStats.passed === testStats.total ? 'text-green-400' : 'text-yellow-400'}`}>
                        {testStats.total > 0 ? ((testStats.passed / testStats.total) * 100).toFixed(1) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Middle Column: Scenarios */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 overflow-y-auto">
            {activeTab === 'voice' ? (
              <>
                <h3 className="text-lg font-semibold mb-3 text-amber-400 sticky top-0 bg-gray-800/90 py-2">
                  음성 처리 시나리오 ({TEST_SCENARIOS.length})
                </h3>
                <div className="space-y-2">
                  {TEST_SCENARIOS.map((scenario) => (
                    <button
                      key={scenario.id}
                      onClick={() => runScenario(scenario)}
                      disabled={isRunningTests}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all border ${
                        currentTestId === scenario.id
                          ? 'bg-amber-900/50 border-amber-500'
                          : 'bg-gray-900/50 border-gray-700/50 hover:bg-gray-900 hover:border-gray-600'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className="text-xs text-gray-400">#{scenario.id}</div>
                      <div className="text-sm font-medium text-white">{scenario.name}</div>
                      <div className="text-xs text-gray-500 mt-1 truncate">{scenario.transcript}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-3 text-blue-400 sticky top-0 bg-gray-800/90 py-2">
                  시스템 E2E 시나리오 ({SYSTEM_TEST_SCENARIOS.length})
                </h3>
                <div className="space-y-2">
                  {SYSTEM_TEST_SCENARIOS.map((scenario) => (
                    <button
                      key={scenario.id}
                      onClick={() => runSystemScenario(scenario)}
                      disabled={isRunningTests}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-all border ${
                        currentSystemTestId === scenario.id
                          ? 'bg-blue-900/50 border-blue-500'
                          : 'bg-gray-900/50 border-gray-700/50 hover:bg-gray-900 hover:border-gray-600'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{scenario.id}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          scenario.difficulty === 'easy' ? 'bg-green-900/50 text-green-400' :
                          scenario.difficulty === 'medium' ? 'bg-yellow-900/50 text-yellow-400' :
                          'bg-red-900/50 text-red-400'
                        }`}>
                          {scenario.difficulty === 'easy' ? '쉬움' : scenario.difficulty === 'medium' ? '중간' : '어려움'}
                        </span>
                      </div>
                      <div className="text-sm font-medium text-white mt-1">{scenario.name}</div>
                      <div className="text-xs text-gray-500 mt-1">{scenario.description}</div>
                      <div className="text-xs text-blue-400/70 mt-1">
                        {scenario.steps.length} steps • {scenario.verifications.length} 검증
                      </div>
                    </button>
                  ))}
                </div>

                {/* 시스템 제어 버튼들 */}
                <div className="mt-4 pt-4 border-t border-gray-700/50">
                  <h4 className="text-sm font-semibold mb-2 text-blue-300">수동 제어</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={onFaceDetected}
                      disabled={!onFaceDetected}
                      className="px-2 py-1.5 text-xs bg-purple-800/50 hover:bg-purple-700/50 disabled:bg-gray-800 disabled:text-gray-600 rounded transition-colors"
                    >
                      👤 얼굴 감지
                    </button>
                    <button
                      onClick={() => sessionTimer?.resetActivity?.()}
                      disabled={!sessionTimer?.resetActivity}
                      className="px-2 py-1.5 text-xs bg-cyan-800/50 hover:bg-cyan-700/50 disabled:bg-gray-800 disabled:text-gray-600 rounded transition-colors"
                    >
                      👆 터치 시뮬레이션
                    </button>
                    <button
                      onClick={() => sessionTimer?.debugFastForward?.(10)}
                      disabled={!sessionTimer?.debugFastForward}
                      className="px-2 py-1.5 text-xs bg-orange-800/50 hover:bg-orange-700/50 disabled:bg-gray-800 disabled:text-gray-600 rounded transition-colors"
                    >
                      ⏩ +10초
                    </button>
                    <button
                      onClick={() => sessionTimer?.stopSession?.()}
                      disabled={!sessionTimer?.stopSession}
                      className="px-2 py-1.5 text-xs bg-red-800/50 hover:bg-red-700/50 disabled:bg-gray-800 disabled:text-gray-600 rounded transition-colors"
                    >
                      ⏹️ 세션 종료
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Column: Logs */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-3 text-amber-400 sticky top-0 bg-gray-800/90 py-2">
              실행 로그 ({logs.length})
            </h3>
            <div className="space-y-2">
              {logs.length === 0 ? (
                <div className="text-center text-gray-500 py-8 text-sm">로그가 없습니다</div>
              ) : (
                logs.map((log, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-900/50 rounded-lg p-3 border border-gray-700/30 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-400">{log.timestamp}</span>
                      {log.validation ? (
                        log.validation.passed ? (
                          <span className="text-green-400 font-bold">✓ PASS</span>
                        ) : (
                          <span className="text-red-400 font-bold">✗ FAIL</span>
                        )
                      ) : log.success ? (
                        <span className="text-green-400">✓</span>
                      ) : (
                        <span className="text-yellow-400">⏳</span>
                      )}
                    </div>
                    <div className="text-amber-300 font-medium mb-1">{log.scenario}</div>
                    <div className="text-gray-300 mb-1">입력: {log.transcript}</div>
                    {log.intent && (
                      <div className="text-gray-400">
                        Intent:{' '}
                        <span className="px-1 py-0.5 bg-amber-900/30 text-amber-300 rounded">
                          {log.intent.type}
                        </span>
                        {log.intent.confidence !== undefined && (
                          <span className="ml-2 text-gray-500">
                            (confidence: {(log.intent.confidence * 100).toFixed(0)}%)
                          </span>
                        )}
                      </div>
                    )}
                    <div className={`mt-1 ${log.validation?.passed ? 'text-green-300' : log.validation ? 'text-red-300' : 'text-gray-300'}`}>
                      {log.message}
                    </div>
                    {log.validation && log.validation.warnings.length > 0 && (
                      <div className="text-yellow-400 mt-1 text-xs">
                        경고: {log.validation.warnings.join(', ')}
                      </div>
                    )}
                    {log.error && <div className="text-red-400 mt-1">Error: {log.error}</div>}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
