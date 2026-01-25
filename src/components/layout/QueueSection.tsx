import { ReactNode } from 'react';

interface QueueSectionProps {
  preparingQueue: ReactNode;
  readyQueue: ReactNode;
}

export function QueueSection({ preparingQueue, readyQueue }: QueueSectionProps) {
  return (
    <footer className="queue-section">
      <div className="queue-half">
        <h3 className="queue-title">
          <span className="text-[var(--color-warning)]">📋</span> 준비 중
        </h3>
        <div className="queue-items">
          {preparingQueue}
        </div>
      </div>
      <div className="queue-divider" />
      <div className="queue-half">
        <h3 className="queue-title">
          <span className="text-[var(--color-success)]">✅</span> 픽업 대기
        </h3>
        <div className="queue-items">
          {readyQueue}
        </div>
      </div>
    </footer>
  );
}
