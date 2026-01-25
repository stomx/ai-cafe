'use client';

import { useQueueStore } from '@/store/queueStore';
import { QueueCard } from './QueueCard';

export function ReadyQueue() {
  const readyQueue = useQueueStore((state) => state.readyQueue);

  if (readyQueue.length === 0) {
    return (
      <span className="text-[var(--color-text-muted)] text-sm">
        픽업 대기 중인 주문이 없습니다
      </span>
    );
  }

  return (
    <>
      {readyQueue.map((item) => (
        <QueueCard key={item.id} item={item} variant="ready" />
      ))}
    </>
  );
}
