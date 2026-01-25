'use client';

import type { OrderItem as OrderItemType } from '@/types/order';
import { Button } from '@/components/ui';

interface OrderItemProps {
  item: OrderItemType;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
}

export function OrderItem({ item, onUpdateQuantity, onRemove }: OrderItemProps) {
  const formatPrice = (price: number) => price.toLocaleString('ko-KR');

  return (
    <div className="order-item">
      <div className="order-item-info">
        <span className="order-item-name">{item.name}</span>
        {item.temperature && (
          <span className={`order-item-temp ${item.temperature === 'HOT' ? 'temp-hot' : 'temp-ice'}`}>
            {item.temperature}
          </span>
        )}
      </div>
      <div className="order-item-controls">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
          className="order-qty-btn"
        >
          −
        </Button>
        <span className="order-item-qty">{item.quantity}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
          className="order-qty-btn"
        >
          +
        </Button>
      </div>
      <div className="order-item-price">
        {formatPrice(item.totalPrice)}원
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(item.id)}
        className="order-remove-btn"
      >
        ✕
      </Button>
    </div>
  );
}
