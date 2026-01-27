import { create } from 'zustand';
import type { QueueItem, QueueStatus } from '@/types/queue';

// 준비 완료 시 호출되는 콜백 (픽업 안내용)
type OnReadyCallback = (orderNumber: number) => void;
let onReadyCallback: OnReadyCallback | null = null;

export const setOnReadyCallback = (callback: OnReadyCallback | null) => {
  onReadyCallback = callback;
};

interface QueueStore {
  preparingQueue: QueueItem[];
  readyQueue: QueueItem[];
  nextOrderNumber: number;
  simulationInterval: NodeJS.Timeout | null;

  // Actions
  addToQueue: (items: string[]) => QueueItem;
  moveToReady: (id: string) => void;
  completeOrder: (id: string) => void;
  clearAll: () => void;

  // Simulation
  startSimulation: () => void;
  stopSimulation: () => void;
}

// 1001~9999 사이의 랜덤 주문번호 생성
const generateRandomOrderNumber = (): number => {
  return Math.floor(Math.random() * (9999 - 1001 + 1)) + 1001;
};

export const useQueueStore = create<QueueStore>((set, get) => ({
  preparingQueue: [],
  readyQueue: [],
  nextOrderNumber: generateRandomOrderNumber(),
  simulationInterval: null,

  addToQueue: (items) => {
    // 랜덤 주문번호 생성 (기존 주문과 중복 방지)
    const { preparingQueue, readyQueue } = get();
    const existingNumbers = new Set([
      ...preparingQueue.map(i => i.orderNumber),
      ...readyQueue.map(i => i.orderNumber),
    ]);

    let orderNumber = generateRandomOrderNumber();
    while (existingNumbers.has(orderNumber)) {
      orderNumber = generateRandomOrderNumber();
    }

    const newItem: QueueItem = {
      id: `order-${orderNumber}`,
      orderNumber,
      items,
      status: 'preparing',
      createdAt: new Date(),
      estimatedTime: Math.floor(Math.random() * 3) + 2,  // 2-4 minutes
    };

    set((state) => ({
      preparingQueue: [...state.preparingQueue, newItem],
      nextOrderNumber: generateRandomOrderNumber(), // 다음 번호도 랜덤
    }));

    return newItem;
  },

  moveToReady: (id) => {
    const item = get().preparingQueue.find((i) => i.id === id);
    if (!item) return;

    set((state) => ({
      preparingQueue: state.preparingQueue.filter((i) => i.id !== id),
      readyQueue: [...state.readyQueue, {
        ...item,
        status: 'ready' as QueueStatus,
        readyAt: new Date(),  // 픽업 대기 시작 시간 기록
      }],
    }));

    // 픽업 대기 안내 콜백 호출
    if (onReadyCallback) {
      onReadyCallback(item.orderNumber);
    }
  },

  completeOrder: (id) => {
    set((state) => ({
      readyQueue: state.readyQueue.filter((i) => i.id !== id),
    }));
  },

  clearAll: () => {
    const { simulationInterval } = get();
    if (simulationInterval) clearInterval(simulationInterval);
    set({
      preparingQueue: [],
      readyQueue: [],
      simulationInterval: null,
    });
  },

  startSimulation: () => {
    const { simulationInterval } = get();
    if (simulationInterval) return;

    // 1초마다 체크하여 시간 기반으로 상태 전환
    const interval = setInterval(() => {
      const { preparingQueue, moveToReady, readyQueue, completeOrder } = get();
      const now = new Date();

      // 10초 경과한 준비중 주문 → 픽업 대기로 이동
      for (const item of preparingQueue) {
        const elapsed = (now.getTime() - new Date(item.createdAt).getTime()) / 1000;
        if (elapsed >= 10) {
          console.log(`[Queue] 준비중 → 픽업대기: ${item.orderNumber}번 (${elapsed.toFixed(1)}초 경과)`);
          moveToReady(item.id);
        }
      }

      // 10초 경과한 픽업 대기 주문 자동 제거
      for (const item of readyQueue) {
        if (!item.readyAt) continue;
        const elapsed = (now.getTime() - new Date(item.readyAt).getTime()) / 1000;
        if (elapsed >= 10) {
          console.log(`[Queue] 픽업대기 → 완료: ${item.orderNumber}번 (${elapsed.toFixed(1)}초 경과)`);
          completeOrder(item.id);
        }
      }
    }, 1000); // 1초마다 체크

    set({ simulationInterval: interval });
  },

  stopSimulation: () => {
    const { simulationInterval } = get();
    if (simulationInterval) {
      clearInterval(simulationInterval);
      set({ simulationInterval: null });
    }
  },
}));
