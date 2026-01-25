import { create } from 'zustand';
import type { QueueItem, QueueStatus } from '@/types/queue';

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

export const useQueueStore = create<QueueStore>((set, get) => ({
  preparingQueue: [],
  readyQueue: [],
  nextOrderNumber: 1001,
  simulationInterval: null,

  addToQueue: (items) => {
    const { nextOrderNumber } = get();
    const newItem: QueueItem = {
      id: `order-${nextOrderNumber}`,
      orderNumber: nextOrderNumber,
      items,
      status: 'preparing',
      createdAt: new Date(),
      estimatedTime: Math.floor(Math.random() * 3) + 2,  // 2-4 minutes
    };

    set((state) => ({
      preparingQueue: [...state.preparingQueue, newItem],
      nextOrderNumber: state.nextOrderNumber + 1,
    }));

    return newItem;
  },

  moveToReady: (id) => {
    set((state) => {
      const item = state.preparingQueue.find((i) => i.id === id);
      if (!item) return state;

      return {
        preparingQueue: state.preparingQueue.filter((i) => i.id !== id),
        readyQueue: [...state.readyQueue, {
          ...item,
          status: 'ready' as QueueStatus,
          readyAt: new Date(),  // 픽업 대기 시작 시간 기록
        }],
      };
    });
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

    // Simulate order completion every 5-10 seconds
    const interval = setInterval(() => {
      const { preparingQueue, moveToReady, readyQueue, completeOrder } = get();

      // Move oldest preparing order to ready
      if (preparingQueue.length > 0) {
        const oldest = preparingQueue[0];
        moveToReady(oldest.id);
      }

      // 1분 경과한 픽업 대기 주문 자동 제거
      const now = new Date();
      const expiredOrders = readyQueue.filter((item) => {
        if (!item.readyAt) return false;
        const elapsed = (now.getTime() - new Date(item.readyAt).getTime()) / 1000;
        return elapsed >= 60; // 60초 = 1분
      });

      for (const expired of expiredOrders) {
        completeOrder(expired.id);
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
