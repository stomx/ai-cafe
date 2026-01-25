'use client';

import type { MenuItem as MenuItemType } from '@/types/menu';
import { MenuItem } from './MenuItem';

interface MenuGridProps {
  items: MenuItemType[];
  onSelectItem: (item: MenuItemType) => void;
}

export function MenuGrid({ items, onSelectItem }: MenuGridProps) {
  if (items.length === 0) {
    return (
      <div className="menu-empty">
        <p>해당 카테고리에 메뉴가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="menu-grid">
      {items.map((item) => (
        <MenuItem key={item.id} item={item} onSelect={onSelectItem} />
      ))}
    </div>
  );
}
