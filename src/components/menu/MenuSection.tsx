'use client';

import { useState } from 'react';
import type { MenuItem as MenuItemType, MenuCategory } from '@/types/menu';
import { menuItems } from '@/data/menu';
import { CategoryTabs } from './CategoryTabs';
import { MenuGrid } from './MenuGrid';

interface MenuSectionProps {
  onSelectItem: (item: MenuItemType) => void;
}

export function MenuSection({ onSelectItem }: MenuSectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>('coffee');

  const filteredItems = menuItems.filter(
    (item) => item.category === selectedCategory && item.available
  );

  return (
    <div className="menu-section-content">
      <CategoryTabs selected={selectedCategory} onSelect={setSelectedCategory} />
      <MenuGrid items={filteredItems} onSelectItem={onSelectItem} />
    </div>
  );
}
