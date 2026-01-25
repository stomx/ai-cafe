import { create } from 'zustand';

export type Orientation = 'landscape' | 'portrait';

interface LayoutStore {
  orientation: Orientation;
  setOrientation: (orientation: Orientation) => void;
  toggleOrientation: () => void;
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  orientation: 'landscape',

  setOrientation: (orientation) => {
    set({ orientation });
  },

  toggleOrientation: () => {
    set((state) => ({
      orientation: state.orientation === 'landscape' ? 'portrait' : 'landscape',
    }));
  },
}));
