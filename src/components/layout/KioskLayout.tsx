'use client';

import { ReactNode, useEffect, useState, useCallback } from 'react';
import { Header } from './Header';
import { MainContent } from './MainContent';
import { QueueSection } from './QueueSection';
import { useLayoutStore } from '@/store/layoutStore';

// FHD 해상도 상수
const FHD_LANDSCAPE = { width: 1920, height: 1080 };
const FHD_PORTRAIT = { width: 1080, height: 1920 };

interface KioskLayoutProps {
  menuSection: ReactNode;
  orderSection: ReactNode;
  preparingQueue: ReactNode;
  readyQueue: ReactNode;
  chatSection?: ReactNode;
  cameraPreview?: ReactNode;
  sessionTimer?: ReactNode;
  faceDetectionEnabled?: boolean;
  onToggleFaceDetection?: () => void;
  onScreenTouch?: () => void;
}

export function KioskLayout({
  menuSection,
  orderSection,
  preparingQueue,
  readyQueue,
  chatSection,
  cameraPreview,
  sessionTimer,
  faceDetectionEnabled,
  onToggleFaceDetection,
  onScreenTouch,
}: KioskLayoutProps) {
  const orientation = useLayoutStore((state) => state.orientation);
  const [scale, setScale] = useState(1);

  const calculateScale = useCallback(() => {
    const fhd = orientation === 'landscape' ? FHD_LANDSCAPE : FHD_PORTRAIT;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // viewport에 맞춰 비율 조정 (확대/축소 모두 허용)
    const scaleX = viewportWidth / fhd.width;
    const scaleY = viewportHeight / fhd.height;
    const newScale = Math.min(scaleX, scaleY);

    setScale(newScale);
  }, [orientation]);

  useEffect(() => {
    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [calculateScale]);

  const fhd = orientation === 'landscape' ? FHD_LANDSCAPE : FHD_PORTRAIT;

  return (
    <div className="kiosk-viewport">
      <div
        className={`kiosk-container kiosk-${orientation}`}
        style={{
          width: fhd.width,
          height: fhd.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
        onClick={onScreenTouch}
      >
        <Header
          cameraPreview={cameraPreview}
          sessionTimer={sessionTimer}
          faceDetectionEnabled={faceDetectionEnabled}
          onToggleFaceDetection={onToggleFaceDetection}
        />
        <MainContent
          menuSection={menuSection}
          orderSection={orderSection}
          chatSection={chatSection}
        />
        <QueueSection
          preparingQueue={preparingQueue}
          readyQueue={readyQueue}
        />
      </div>
    </div>
  );
}
