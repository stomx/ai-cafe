'use client';

import { useOrderStore } from '@/store/orderStore';

export function OrderSummary() {
  const getTotal = useOrderStore((state) => state.getTotal);
  const getItemCount = useOrderStore((state) => state.getItemCount);

  const total = getTotal();
  const itemCount = getItemCount();
  const formatPrice = (price: number) => price.toLocaleString('ko-KR');

  return (
    <div className="order-summary">
      <div className="order-summary-row">
        <span>주문 수량</span>
        <span>{itemCount}개</span>
      </div>
      <div className="order-summary-total">
        <span>총 금액</span>
        <span className="order-total-price">{formatPrice(total)}원</span>
      </div>
    </div>
  );
}
