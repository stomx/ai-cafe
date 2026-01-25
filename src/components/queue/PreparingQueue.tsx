'use client';

import { useQueueStore } from '@/store/queueStore';
import { QueueCard } from './QueueCard';

export function PreparingQueue() {
  const preparingQueue = useQueueStore((state) => state.preparingQueue);

  if (preparingQueue.length === 0) {
    return (
      <span className="text-[var(--color-text-muted)] text-sm">
        대기 중인 주문이 없습니다
      </span>
    );
  }

  return (
    <>
      {preparingQueue.map((item) => (
        <QueueCard key={item.id} item={item} variant="preparing" />
      ))}
    </>
  );
}
