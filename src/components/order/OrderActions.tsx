'use client';

import { Button } from '@/components/ui';
import { useOrderStore } from '@/store/orderStore';

interface OrderActionsProps {
  onConfirm: () => void;
  disabled?: boolean;
}

export function OrderActions({ onConfirm, disabled }: OrderActionsProps) {
  const clearOrder = useOrderStore((state) => state.clearOrder);
  const itemCount = useOrderStore((state) => state.getItemCount)();

  return (
    <div className="order-actions">
      <Button
        variant="ghost"
        size="lg"
        onClick={clearOrder}
        disabled={itemCount === 0}
      >
        전체 취소
      </Button>
      <Button
        variant="primary"
        size="lg"
        onClick={onConfirm}
        disabled={disabled || itemCount === 0}
        className="order-confirm-btn"
      >
        주문하기 ({itemCount}개)
      </Button>
    </div>
  );
}
