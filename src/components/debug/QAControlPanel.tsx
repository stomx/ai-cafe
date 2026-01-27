'use client';

import { useState, useRef, useEffect } from 'react';
import { useOrderStore } from '@/store/orderStore';
import type { OrderIntent } from '@/lib/gemini/types';

interface TestScenario {
  id: number;
  name: string;
  transcript: string;
  expectedIntent: string;
  expectedResult: string;
  initialOrder?: Array<{ menuId: string; temperature: 'HOT' | 'ICE' | null; quantity: number }>;
}

interface TestLog {
  timestamp: string;
  scenario: string;
  transcript: string;
  intent: OrderIntent | null;
  success: boolean;
  message: string;
  error?: string;
}

interface QAControlPanelProps {
  onTranscriptSubmit: (transcript: string) => void;
  lastIntent?: OrderIntent | null;
  lastTTSMessage?: string;
}

// E2E 테스트 시나리오 정의
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

export default function QAControlPanel({ onTranscriptSubmit, lastIntent, lastTTSMessage }: QAControlPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [logs, setLogs] = useState<TestLog[]>([]);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [currentTestId, setCurrentTestId] = useState<number | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const orderItems = useOrderStore((state) => state.items);

  // 로그 자동 스크롤
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (log: Omit<TestLog, 'timestamp'>) => {
    setLogs((prev) => [
      ...prev,
      {
        ...log,
        timestamp: new Date().toLocaleTimeString('ko-KR'),
      },
    ]);
  };

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
      transcript: scenario.transcript,
      intent: null,
      success: false,
      message: 'Running...',
    });

    // 트랜스크립트 제출
    onTranscriptSubmit(scenario.transcript);

    // 결과 대기 (실제로는 onTranscriptSubmit 콜백으로 처리)
    await new Promise((resolve) => setTimeout(resolve, 2000));

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
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            닫기
          </button>
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
                <button
                  onClick={runAllTests}
                  disabled={isRunningTests}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
                >
                  {isRunningTests ? '테스트 실행 중...' : '전체 테스트 실행'}
                </button>
                <button
                  onClick={clearLogs}
                  className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                >
                  로그 초기화
                </button>
              </div>
            </div>
          </div>

          {/* Middle Column: Scenarios */}
          <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-3 text-amber-400 sticky top-0 bg-gray-800/90 py-2">
              테스트 시나리오 ({TEST_SCENARIOS.length})
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
                      {log.success ? (
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
                      </div>
                    )}
                    <div className="text-gray-300 mt-1">{log.message}</div>
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
