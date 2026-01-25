export type MenuCategory = 'coffee' | 'non-coffee' | 'dessert' | 'seasonal';

export interface MenuItem {
  id: string;
  name: string;
  nameEn: string;
  category: MenuCategory;
  price: number;
  temperatures: ('HOT' | 'ICE')[];
  image?: string;
  description?: string;
  available: boolean;
}

export const CATEGORY_LABELS: Record<MenuCategory, string> = {
  'coffee': '커피',
  'non-coffee': '논커피',
  'dessert': '디저트',
  'seasonal': '시즌',
};
