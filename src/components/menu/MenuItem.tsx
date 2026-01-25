'use client';

import { useCallback, useState } from 'react';
import Image from 'next/image';
import type { MenuItem as MenuItemType } from '@/types/menu';
import { cn } from '@/lib/utils/cn';

interface MenuItemProps {
  item: MenuItemType;
  onSelect: (item: MenuItemType) => void;
}

// 카테고리별 아이콘 매핑 (이미지 로드 실패 시 fallback)
const categoryIcons: Record<string, string> = {
  coffee: '☕',
  'non-coffee': '🍵',
  dessert: '🍰',
  seasonal: '✨',
};

export function MenuItem({ item, onSelect }: MenuItemProps) {
  const [imageError, setImageError] = useState(false);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat('ko-KR').format(price);

  const handleClick = useCallback(() => {
    onSelect(item);
  }, [item, onSelect]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(item);
    }
  }, [item, onSelect]);

  const tempLabel = item.temperatures.length > 0
    ? item.temperatures.join('/')
    : '';

  return (
    <button
      type="button"
      className="menu-item-card"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      aria-label={`${item.name}, ${formatPrice(item.price)}원${tempLabel ? `, ${tempLabel} 가능` : ''}`}
    >
      {/* 배경 이미지 */}
      <div className="menu-item-image" aria-hidden="true">
        {item.image && !imageError ? (
          <Image
            src={item.image}
            alt={item.name}
            fill
            sizes="(max-width: 768px) 150px, 200px"
            className="object-cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <span className="menu-item-fallback-icon">{categoryIcons[item.category] || '🍽️'}</span>
        )}
      </div>

      {/* 오버레이 정보 */}
      <div className="menu-item-overlay">
        {/* 온도 옵션 */}
        {item.temperatures.length > 0 && (
          <div className="menu-item-temps" aria-hidden="true">
            {item.temperatures.map((temp) => (
              <span
                key={temp}
                className={cn('temp-badge', temp === 'HOT' ? 'temp-hot' : 'temp-ice')}
              >
                {temp}
              </span>
            ))}
          </div>
        )}

        {/* 메뉴 정보 */}
        <div className="menu-item-info">
          <h3 className="menu-item-name">{item.name}</h3>
          <p className="menu-item-price">
            <span className="tabular-nums">{formatPrice(item.price)}</span>
            <span className="price-unit">원</span>
          </p>
        </div>
      </div>

      {/* 뱃지 (예: 인기, 신메뉴) */}
      {item.description && (
        <span className="menu-item-badge" aria-hidden="true">
          {item.description}
        </span>
      )}
    </button>
  );
}
