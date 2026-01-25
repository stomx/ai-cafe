'use client';

import { useCallback } from 'react';
import { MenuCategory, CATEGORY_LABELS } from '@/types/menu';
import { cn } from '@/lib/utils/cn';

interface CategoryTabsProps {
  selected: MenuCategory;
  onSelect: (category: MenuCategory) => void;
}

const categories: MenuCategory[] = ['coffee', 'non-coffee', 'dessert', 'seasonal'];

const categoryIcons: Record<MenuCategory, string> = {
  coffee: '☕',
  'non-coffee': '🍵',
  dessert: '🍰',
  seasonal: '✨',
};

export function CategoryTabs({ selected, onSelect }: CategoryTabsProps) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent, category: MenuCategory) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(category);
    }
  }, [onSelect]);

  return (
    <div className="category-tabs" role="tablist" aria-label="메뉴 카테고리">
      {categories.map((category) => {
        const isSelected = selected === category;
        return (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={`menu-panel-${category}`}
            tabIndex={isSelected ? 0 : -1}
            className={cn('category-tab', isSelected && 'category-tab-active')}
            onClick={() => onSelect(category)}
            onKeyDown={(e) => handleKeyDown(e, category)}
          >
            <span aria-hidden="true">{categoryIcons[category]}</span>
            <span>{CATEGORY_LABELS[category]}</span>
          </button>
        );
      })}
    </div>
  );
}
