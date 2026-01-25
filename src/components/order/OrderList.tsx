'use client';

import { useOrderStore } from '@/store/orderStore';
import { OrderItem } from './OrderItem';

export function OrderList() {
  const items = useOrderStore((state) => state.items);
  const updateQuantity = useOrderStore((state) => state.updateQuantity);
  const removeItem = useOrderStore((state) => state.removeItem);

  if (items.length === 0) {
    return (
      <div className="order-empty">
        <p>주문 내역이 없습니다</p>
        <p className="text-sm">메뉴를 선택하거나 음성으로 주문해주세요</p>
      </div>
    );
  }

  return (
    <div className="order-list">
      {items.map((item) => (
        <OrderItem
          key={item.id}
          item={item}
          onUpdateQuantity={updateQuantity}
          onRemove={removeItem}
        />
      ))}
    </div>
  );
}
