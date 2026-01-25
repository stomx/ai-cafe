'use client';

import { ReactNode } from 'react';
import { StatusDot } from '@/components/ui';
import { useAIStatus } from '@/hooks/useAIStatus';
import { useLayoutStore } from '@/store/layoutStore';

// CI Logo Component
function BrandLogo() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 20H28V27C28 31.4183 24.4183 35 20 35C15.5817 35 12 31.4183 12 27V20ZM28 22V26H31C32.1046 26 33 25.1046 33 24C33 22.8954 32.1046 22 31 22H28ZM14 11C14 10.4477 14.4477 10 15 10C15.5523 10 16 10.4477 16 11V15C16 15.5523 15.5523 16 15 16C14.4477 16 14 15.5523 14 15V11ZM19 7C19 6.44772 19.4477 6 20 6C20.5523 6 21 6.44772 21 7V13C21 13.5523 20.5523 14 20 14C19.4477 14 19 13.5523 19 13V7ZM24 11C24 10.4477 24.4477 10 25 10C25.5523 10 26 10.4477 26 11V15C26 15.5523 25.5523 16 25 16C24.4477 16 24 15.5523 24 15V11Z"
        fill="#C9A66B"
      />
    </svg>
  );
}

interface HeaderProps {
  cameraPreview?: ReactNode;
  sessionTimer?: ReactNode;
  faceDetectionEnabled?: boolean;
  onToggleFaceDetection?: () => void;
}

export function Header({ cameraPreview, sessionTimer, faceDetectionEnabled = true, onToggleFaceDetection }: HeaderProps) {
  const { faceDetection, stt, tts, llm } = useAIStatus();
  const { orientation, toggleOrientation } = useLayoutStore();

  return (
    <header className="kiosk-header">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <BrandLogo />
          <div>
            <h1 className="font-display text-xl font-semibold text-[var(--color-primary)] tracking-wide">
              Midnight Roast
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] tracking-widest uppercase">
              AI Cafe
            </p>
          </div>
        </div>
        {sessionTimer}
      </div>

      <div className="flex items-center gap-5">
        {/* Camera Preview in Header */}
        {cameraPreview && (
          <div className="header-camera">
            {cameraPreview}
          </div>
        )}

        {/* Face Detection Toggle */}
        {onToggleFaceDetection && (
          <button
            onClick={onToggleFaceDetection}
            className={`face-toggle ${faceDetectionEnabled ? 'active' : ''}`}
            aria-label={faceDetectionEnabled ? '얼굴 인식 끄기' : '얼굴 인식 켜기'}
            title={faceDetectionEnabled ? '얼굴 인식 끄기' : '얼굴 인식 켜기'}
          >
            <span className="face-toggle-icon">{faceDetectionEnabled ? '👁️' : '🚫'}</span>
            <span className="face-toggle-label">{faceDetectionEnabled ? 'Face ON' : 'Face OFF'}</span>
          </button>
        )}

        {/* Orientation Toggle Button */}
        <button
          onClick={toggleOrientation}
          className="orientation-toggle"
          aria-label={orientation === 'landscape' ? '세로 모드로 전환' : '가로 모드로 전환'}
          title={orientation === 'landscape' ? '세로 모드로 전환' : '가로 모드로 전환'}
        >
          {orientation === 'landscape' ? '세로' : '가로'}
        </button>

        <div className="flex items-center gap-6 px-4 py-2 rounded-full glass">
          <StatusDot
            status={faceDetection.status === 'ready' ? 'ready' : faceDetection.status === 'loading' ? 'loading' : 'idle'}
            label="Face"
          />
          <StatusDot
            status={stt.status === 'ready' || stt.status === 'fallback' ? 'ready' : stt.status === 'loading' ? 'loading' : 'idle'}
            label="STT"
          />
          <StatusDot
            status={tts.status === 'ready' || tts.status === 'fallback' ? 'ready' : tts.status === 'loading' ? 'loading' : 'idle'}
            label="TTS"
          />
          <StatusDot
            status={llm.status === 'ready' || llm.status === 'fallback' ? 'ready' : llm.status === 'loading' ? 'loading' : 'idle'}
            label="AI"
          />
        </div>
      </div>
    </header>
  );
}
