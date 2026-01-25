export type QueueStatus = 'preparing' | 'ready';

export interface QueueItem {
  id: string;
  orderNumber: number;
  items: string[];  // Menu item names summary
  status: QueueStatus;
  createdAt: Date;
  readyAt?: Date;  // 픽업 대기 시작 시간
  estimatedTime?: number;  // minutes
}
