'use client';

import { useCallback } from 'react';
import { useOrderStore } from '@/store/orderStore';
import { useQueueStore } from '@/store/queueStore';
import { useChatStore } from '@/store/chatStore';
import { menuItems } from '@/data/menu';
import type { MenuItem } from '@/types/menu';
import type { Temperature } from '@/types/order';

export interface OrderActionResult {
  success: boolean;
  message: string;
  needsClarification?: boolean;
  clarificationData?: {
    menuItem: MenuItem;
    quantity: number;
  };
}

export interface OrderActions {
  handleAddItem: (menuId: string, temperature: Temperature | null, quantity?: number) => OrderActionResult;
  handleRemoveItem: (menuId: string) => OrderActionResult;
  handleChangeQuantity: (menuId: string, quantity: number) => OrderActionResult;
  handleChangeTemperature: (menuId: string, temperature: Temperature) => OrderActionResult;
  handleClearOrder: () => OrderActionResult;
  handleConfirmOrder: () => OrderActionResult;
  getMenuItem: (menuId: string) => MenuItem | undefined;
}

interface UseOrderActionsOptions {
  onOrderConfirmed?: () => void;
  onNeedTemperatureSelect?: (menuItem: MenuItem, quantity: number) => void;
}

export function useOrderActions({
  onOrderConfirmed,
  onNeedTemperatureSelect,
}: UseOrderActionsOptions): OrderActions {
  const addItem = useOrderStore((state) => state.addItem);
  const removeItem = useOrderStore((state) => state.removeItem);
  const updateQuantity = useOrderStore((state) => state.updateQuantity);
  const clearOrder = useOrderStore((state) => state.clearOrder);
  const items = useOrderStore((state) => state.items);
  const addToQueue = useQueueStore((state) => state.addToQueue);
  const clearMessages = useChatStore((state) => state.clearMessages);

  const getMenuItem = useCallback((menuId: string): MenuItem | undefined => {
    return menuItems.find((item) => item.id === menuId);
  }, []);

  // 메뉴 추가 (음성/터치 공용)
  const handleAddItem = useCallback((
    menuId: string,
    temperature: Temperature | null,
    quantity: number = 1
  ): OrderActionResult => {
    const menuItem = getMenuItem(menuId);
    if (!menuItem) {
      return { success: false, message: '메뉴를 찾을 수 없습니다.' };
    }

    // 온도 선택이 필요한 경우
    if (temperature === null && menuItem.temperatures.length > 1) {
      if (onNeedTemperatureSelect) {
        onNeedTemperatureSelect(menuItem, quantity);
      }
      return {
        success: false,
        needsClarification: true,
        message: `${menuItem.name} 따뜻하게 드릴까요, 차갑게 드릴까요?`,
        clarificationData: { menuItem, quantity },
      };
    }

    // 온도가 하나만 있는 경우 자동 선택
    const finalTemp = temperature ?? (menuItem.temperatures.length === 1 ? menuItem.temperatures[0] : null);

    // 아이템 추가 (quantity만큼 반복)
    for (let i = 0; i < quantity; i++) {
      addItem(menuItem, finalTemp);
    }

    // 온도 한글 변환: "따뜻한 아메리카노", "아이스 카페라떼"
    const tempKo = finalTemp === 'HOT' ? '따뜻한 ' : finalTemp === 'ICE' ? '아이스 ' : '';
    const msg = `${tempKo}${menuItem.name} ${quantity}잔 추가했습니다.`;

    return { success: true, message: msg };
  }, [addItem, getMenuItem, onNeedTemperatureSelect]);

  // 메뉴 제거 (음성/터치 공용)
  const handleRemoveItem = useCallback((menuId: string): OrderActionResult => {
    const orderItem = items.find((item) => item.menuId === menuId);
    if (!orderItem) {
      return { success: false, message: '주문 목록에서 해당 메뉴를 찾을 수 없습니다.' };
    }

    removeItem(orderItem.id);
    const msg = `${orderItem.name} 삭제했습니다.`;

    return { success: true, message: msg };
  }, [items, removeItem]);

  // 수량 변경 (음성/터치 공용)
  const handleChangeQuantity = useCallback((menuId: string, quantity: number): OrderActionResult => {
    const orderItem = items.find((item) => item.menuId === menuId);
    if (!orderItem) {
      return { success: false, message: '주문 목록에서 해당 메뉴를 찾을 수 없습니다.' };
    }

    if (quantity <= 0) {
      removeItem(orderItem.id);
      const msg = `${orderItem.name} 삭제했습니다.`;
      return { success: true, message: msg };
    }

    updateQuantity(orderItem.id, quantity);
    // 온도 한글 변환: "따뜻한 아메리카노", "아이스 카페라떼"
    const tempKo = orderItem.temperature === 'HOT' ? '따뜻한 ' : orderItem.temperature === 'ICE' ? '아이스 ' : '';
    const msg = `${tempKo}${orderItem.name} ${quantity}잔으로 변경했습니다.`;

    return { success: true, message: msg };
  }, [items, updateQuantity, removeItem]);

  // 온도 변경 (음성/터치 공용)
  const handleChangeTemperature = useCallback((menuId: string, temperature: Temperature): OrderActionResult => {
    const orderItem = items.find((item) => item.menuId === menuId);
    if (!orderItem) {
      return { success: false, message: '주문 목록에서 해당 메뉴를 찾을 수 없습니다.' };
    }

    const menuItem = getMenuItem(menuId);
    if (!menuItem) {
      return { success: false, message: '메뉴를 찾을 수 없습니다.' };
    }

    // 요청한 온도가 해당 메뉴에서 가능한지 확인
    if (!menuItem.temperatures.includes(temperature)) {
      const availableTemps = menuItem.temperatures.join('/');
      return {
        success: false,
        message: `${menuItem.name}은 ${temperature}가 없어요. ${availableTemps}만 가능합니다.`,
      };
    }

    // 이미 같은 온도인 경우
    if (orderItem.temperature === temperature) {
      const tempKo = temperature === 'HOT' ? '따뜻한' : '아이스';
      return {
        success: true,
        message: `이미 ${tempKo} ${orderItem.name}입니다.`,
      };
    }

    // 기존 아이템 삭제 후 새 온도로 추가
    const quantity = orderItem.quantity;
    removeItem(orderItem.id);
    for (let i = 0; i < quantity; i++) {
      addItem(menuItem, temperature);
    }

    const tempKo = temperature === 'HOT' ? '따뜻한' : '아이스';
    const msg = `${tempKo} ${menuItem.name}으로 변경했습니다.`;

    return { success: true, message: msg };
  }, [items, getMenuItem, removeItem, addItem]);

  // 주문 초기화 (음성/터치 공용)
  const handleClearOrder = useCallback((): OrderActionResult => {
    if (items.length === 0) {
      return { success: false, message: '주문 내역이 없습니다.' };
    }

    clearOrder();
    const msg = '주문을 취소했습니다.';

    return { success: true, message: msg };
  }, [items, clearOrder]);

  // 주문 확정 (음성/터치 공용)
  const handleConfirmOrder = useCallback((): OrderActionResult => {
    if (items.length === 0) {
      return { success: false, message: '아직 주문 내역이 없어요. 먼저 메뉴를 선택해주세요.' };
    }

    // quantity 고려하여 아이템 목록 생성
    const itemNames = items.flatMap((item) => {
      const name = item.temperature ? `${item.name}(${item.temperature})` : item.name;
      return Array(item.quantity).fill(name);
    });

    addToQueue(itemNames);
    clearOrder();
    clearMessages();

    if (onOrderConfirmed) {
      onOrderConfirmed();
    }

    const msg = '주문이 완료되었습니다! 잠시만 기다려주세요.';

    return { success: true, message: msg };
  }, [items, addToQueue, clearOrder, clearMessages, onOrderConfirmed]);

  return {
    handleAddItem,
    handleRemoveItem,
    handleChangeQuantity,
    handleChangeTemperature,
    handleClearOrder,
    handleConfirmOrder,
    getMenuItem,
  };
}
