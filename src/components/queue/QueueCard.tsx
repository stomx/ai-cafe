import type { QueueItem } from '@/types/queue';
import { cn } from '@/lib/utils/cn';

interface QueueCardProps {
  item: QueueItem;
  variant?: 'preparing' | 'ready';
}

// 같은 항목을 그룹화하여 수량 계산
function groupItems(items: string[]): { name: string; count: number }[] {
  const countMap = new Map<string, number>();

  for (const item of items) {
    countMap.set(item, (countMap.get(item) || 0) + 1);
  }

  return Array.from(countMap.entries()).map(([name, count]) => ({
    name,
    count,
  }));
}

export function QueueCard({ item, variant = 'preparing' }: QueueCardProps) {
  const groupedItems = groupItems(item.items);

  return (
    <div className={cn('queue-card', `queue-card-${variant}`)}>
      <span className="queue-card-number">#{item.orderNumber}</span>
      <div className="queue-card-items">
        {groupedItems.map((grouped, index) => (
          <span key={index} className="queue-card-item">
            {grouped.name} <span className="queue-card-count">x{grouped.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
