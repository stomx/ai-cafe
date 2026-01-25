'use client';

import { useEffect, useCallback, useState } from 'react';
import { useFaceDetection } from '@/hooks/useFaceDetection';

interface CameraPreviewProps {
  onFaceDetected?: () => void;
  onFaceLost?: () => void;
  showPreview?: boolean;
  autoStart?: boolean;
  enabled?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export function CameraPreview({
  onFaceDetected,
  onFaceLost,
  showPreview = false,
  autoStart = true,
  enabled = true,
  size = 'medium',
}: CameraPreviewProps) {
  const [hasGreeted, setHasGreeted] = useState(false);

  const handleFaceDetected = useCallback(() => {
    if (!hasGreeted) {
      setHasGreeted(true);
      onFaceDetected?.();
    }
  }, [hasGreeted, onFaceDetected]);

  const handleFaceLost = useCallback(() => {
    // Reset greeting state after face is lost for a while
    const timeout = setTimeout(() => {
      setHasGreeted(false);
    }, 5000);

    onFaceLost?.();

    return () => clearTimeout(timeout);
  }, [onFaceLost]);

  const {
    isActive,
    isFaceDetected,
    isSupported,
    isCameraReady,
    startDetection,
    stopDetection,
    error,
    videoRef,
  } = useFaceDetection({
    onFaceDetected: handleFaceDetected,
    onFaceLost: handleFaceLost,
    detectionInterval: 500,
  });

  // Auto-start detection (only when enabled)
  useEffect(() => {
    let mounted = true;

    const initCamera = async () => {
      if (enabled && autoStart && isSupported && !isActive && mounted) {
        await startDetection();
      }
    };

    initCamera();

    return () => {
      mounted = false;
    };
  }, [enabled, autoStart, isSupported, isActive, startDetection]);

  // Stop detection when disabled
  useEffect(() => {
    if (!enabled && isActive) {
      stopDetection();
    }
  }, [enabled, isActive, stopDetection]);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      stopDetection();
    };
  }, [stopDetection]);

  if (!isSupported) {
    return null;
  }

  const sizeClass = `size-${size}`;

  return (
    <div className={`camera-preview-container ${showPreview ? 'with-preview' : ''} ${sizeClass}`}>
      {/* Video element for face detection */}
      <div className={showPreview ? 'camera-video-wrapper' : 'camera-hidden-wrapper'}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="camera-preview-video"
        />

        {/* Overlay status on video */}
        {showPreview && isActive && (
          <div className="camera-overlay-status">
            <div className={`camera-status-dot ${isCameraReady ? 'active' : 'loading'}`} />
            {isFaceDetected && (
              <span className="camera-face-badge">😊</span>
            )}
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="camera-error">
          <p>{error}</p>
          <button
            onClick={() => startDetection()}
            className="camera-retry-btn"
          >
            다시 시도
          </button>
        </div>
      )}

      <style jsx>{`
        .camera-preview-container {
          position: relative;
        }

        .camera-preview-container.with-preview {
          display: inline-block;
        }

        .camera-hidden-wrapper {
          position: absolute;
          width: 1px;
          height: 1px;
          opacity: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .camera-video-wrapper {
          position: relative;
          width: 160px;
          height: 120px;
          border-radius: 12px;
          overflow: hidden;
          border: 3px solid var(--color-border, #333);
          background: #000;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        /* Size variants */
        .size-small .camera-video-wrapper {
          width: 80px;
          height: 60px;
          border-radius: 8px;
          border-width: 2px;
        }

        .size-small .camera-overlay-status {
          top: 4px;
          left: 4px;
          gap: 3px;
        }

        .size-small .camera-status-dot {
          width: 6px;
          height: 6px;
        }

        .size-small .camera-face-badge {
          font-size: 12px;
        }

        .size-large .camera-video-wrapper {
          width: 200px;
          height: 150px;
        }

        .camera-preview-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
        }

        .camera-overlay-status {
          position: absolute;
          top: 8px;
          left: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .camera-status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          box-shadow: 0 0 6px currentColor;
        }

        .camera-status-dot.active {
          background: #22c55e;
          box-shadow: 0 0 8px #22c55e;
        }

        .camera-status-dot.loading {
          background: #eab308;
          animation: blink 1s infinite;
        }

        .camera-face-badge {
          font-size: 18px;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));
        }

        .camera-error {
          padding: 8px;
          background: rgba(239, 68, 68, 0.1);
          border-radius: 4px;
          text-align: center;
        }

        .camera-error p {
          color: #ef4444;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .camera-retry-btn {
          padding: 4px 12px;
          background: #ef4444;
          color: white;
          border: none;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
        }

        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
