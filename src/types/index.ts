// Base types for AI Cafe kiosk
// TODO: Add specific types as features are implemented

export * from './ai';
export * from './menu';
export * from './queue';
export * from './order';

export interface MenuItem {
  id: string;
  name: string;
  nameKo: string;
  price: number;
  category: string;
  description?: string;
  image?: string;
}

export interface OrderItem {
  menuItem: MenuItem;
  quantity: number;
  options?: Record<string, string>;
}

export interface Order {
  id: string;
  items: OrderItem[];
  status: OrderStatus;
  createdAt: Date;
  totalPrice: number;
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed';

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
