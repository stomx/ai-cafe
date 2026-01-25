'use client';

import { useAIStore } from '@/store/aiStore';
import { useEffect, useState } from 'react';
import { checkBrowserSupport, type BrowserSupport } from '@/lib/utils/browser-support';

export function useAIStatus() {
  const store = useAIStore();
  const [browserSupport, setBrowserSupport] = useState<BrowserSupport | null>(null);

  useEffect(() => {
    setBrowserSupport(checkBrowserSupport());
  }, []);

  return {
    faceDetection: store.faceDetection,
    stt: store.stt,
    tts: store.tts,
    llm: store.llm,
    isAllReady: store.isAllReady(),
    isAnyLoading: store.isAnyLoading(),
    browserSupport,
  };
}
