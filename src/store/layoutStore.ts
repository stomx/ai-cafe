import { create } from 'zustand';

export type Orientation = 'landscape' | 'portrait';

interface LayoutStore {
  orientation: Orientation;
  setOrientation: (orientation: Orientation) => void;
  toggleOrientation: () => void;
  initOrientation: () => void;
}

// 모바일 기기 감지 (화면 폭 768px 이하 또는 세로가 더 긴 경우)
const getInitialOrientation = (): Orientation => {
  if (typeof window === 'undefined') return 'landscape';

  const isMobile = window.innerWidth <= 768;
  const isPortraitScreen = window.innerHeight > window.innerWidth;

  return (isMobile || isPortraitScreen) ? 'portrait' : 'landscape';
};

export const useLayoutStore = create<LayoutStore>((set) => ({
  orientation: 'landscape', // SSR 기본값

  setOrientation: (orientation) => {
    set({ orientation });
  },

  toggleOrientation: () => {
    set((state) => ({
      orientation: state.orientation === 'landscape' ? 'portrait' : 'landscape',
    }));
  },

  initOrientation: () => {
    set({ orientation: getInitialOrientation() });
  },
}));
