import { create } from 'zustand';
import type { OrderItem, Temperature } from '@/types/order';
import type { MenuItem } from '@/types/menu';

interface OrderStore {
  items: OrderItem[];

  // Actions
  addItem: (menuItem: MenuItem, temperature: Temperature | null) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearOrder: () => void;

  // Computed
  getTotal: () => number;
  getItemCount: () => number;
}

let orderItemId = 0;

export const useOrderStore = create<OrderStore>((set, get) => ({
  items: [],

  addItem: (menuItem, temperature) => {
    const { items } = get();

    // Check if same item with same temperature exists
    const existingIndex = items.findIndex(
      (item) => item.menuId === menuItem.id && item.temperature === temperature
    );

    if (existingIndex >= 0) {
      // Increment quantity
      set((state) => {
        const newItems = [...state.items];
        newItems[existingIndex] = {
          ...newItems[existingIndex],
          quantity: newItems[existingIndex].quantity + 1,
          totalPrice: (newItems[existingIndex].quantity + 1) * newItems[existingIndex].unitPrice,
        };
        return { items: newItems };
      });
    } else {
      // Add new item
      const newItem: OrderItem = {
        id: `order-item-${++orderItemId}`,
        menuId: menuItem.id,
        name: menuItem.name,
        temperature,
        quantity: 1,
        unitPrice: menuItem.price,
        totalPrice: menuItem.price,
      };
      set((state) => ({ items: [...state.items, newItem] }));
    }
  },

  removeItem: (id) => {
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }));
  },

  updateQuantity: (id, quantity) => {
    if (quantity <= 0) {
      get().removeItem(id);
      return;
    }
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? { ...item, quantity, totalPrice: quantity * item.unitPrice }
          : item
      ),
    }));
  },

  clearOrder: () => set({ items: [] }),

  getTotal: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.totalPrice, 0);
  },

  getItemCount: () => {
    const { items } = get();
    return items.reduce((sum, item) => sum + item.quantity, 0);
  },
}));
