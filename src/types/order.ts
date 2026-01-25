export type Temperature = 'HOT' | 'ICE';

export interface OrderItem {
  id: string;
  menuId: string;
  name: string;
  temperature: Temperature | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface Order {
  id: string;
  orderNumber: number;
  items: OrderItem[];
  total: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed';
  createdAt: Date;
}
