'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { getTTSCacheInfo } from '@/lib/tts';
import { useLayoutStore } from '@/store/layoutStore';
import styles from './ServiceLoader.module.css';

// FHD 해상도 상수
const FHD_LANDSCAPE = { width: 1920, height: 1080 };
const FHD_PORTRAIT = { width: 1080, height: 1920 };

interface ServiceLoaderProps {
  onReady: () => void;
}

export function ServiceLoader({ onReady }: ServiceLoaderProps) {
  const [loadingMessage, setLoadingMessage] = useState('서비스 준비 중...');
  const [progress, setProgress] = useState(0);
  const [isCached, setIsCached] = useState(false);
  const orientation = useLayoutStore((state) => state.orientation);
  const [scale, setScale] = useState(1);

  const calculateScale = useCallback(() => {
    const fhd = orientation === 'landscape' ? FHD_LANDSCAPE : FHD_PORTRAIT;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

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

  const handleLoadProgress = useCallback((prog: number, message: string) => {
    setProgress(prog);
    setLoadingMessage(message);
  }, []);

  const handleLoadError = useCallback(() => {
    setLoadingMessage('기본 음성 엔진으로 전환...');
  }, []);

  const { loadSupertonic } = useTextToSpeech({
    onLoadProgress: handleLoadProgress,
    onError: handleLoadError,
    preferSupertonic: true,
  });

  // Start loading Supertonic immediately
  useEffect(() => {
    let mounted = true;

    const startLoading = async () => {
      try {
        // Check cache first
        const cacheInfo = await getTTSCacheInfo();
        if (mounted && cacheInfo.cached) {
          setIsCached(true);
          setLoadingMessage('캐시에서 로딩 중...');
        } else {
          setLoadingMessage('음성 엔진 다운로드 중...');
        }

        const success = await loadSupertonic();

        if (!mounted) return;

        if (success) {
          setProgress(100);
          setLoadingMessage('준비 완료!');
          // Small delay for UI feedback
          setTimeout(() => {
            if (mounted) onReady();
          }, 500);
        } else {
          // Fallback to Web Speech API
          setLoadingMessage('기본 음성 엔진으로 전환...');
          setTimeout(() => {
            if (mounted) onReady();
          }, 1000);
        }
      } catch (err) {
        if (!mounted) return;
        console.error('[ServiceLoader] Load error:', err);
        // Still allow app to proceed with fallback
        setLoadingMessage('기본 음성 엔진으로 전환...');
        setTimeout(() => {
          if (mounted) onReady();
        }, 1000);
      }
    };

    startLoading();

    return () => {
      mounted = false;
    };
  }, [loadSupertonic, onReady]);

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
      >
        <div className={styles.container}>
          {/* Background pattern */}
          <div className={styles.background}>
            <div className={styles.pattern} />
          </div>

          {/* Content */}
          <div className={styles.content}>
            {/* Logo/Brand */}
            <div className={styles.brand}>
              <div className={styles.logoIcon}>
                <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Coffee cup */}
                  <path
                    d="M16 24h28c0 16-6 24-14 24S16 40 16 24z"
                    fill="currentColor"
                    opacity="0.2"
                  />
                  <path
                    d="M16 24h28c0 16-6 24-14 24S16 40 16 24z"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                  />
                  {/* Handle */}
                  <path
                    d="M44 28c4 0 8 2 8 8s-4 8-8 8"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill="none"
                  />
                  {/* Steam */}
                  <path
                    d="M24 16c0-4 4-4 4-8M30 16c0-4 4-4 4-8M36 16c0-4 4-4 4-8"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className={styles.steam}
                  />
                </svg>
              </div>
              <h2 className={styles.title}>AI Cafe</h2>
              <p className={styles.subtitle}>Midnight Roast</p>
            </div>

            {/* Loading indicator */}
            <div className={styles.loader}>
              {/* Progress bar */}
              <div className={styles.progressContainer}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${progress}%` }}
                />
                <div className={styles.progressGlow} style={{ left: `${progress}%` }} />
              </div>

              {/* Status */}
              <div className={styles.status}>
                <span className={styles.message}>{loadingMessage}</span>
                <span className={styles.percentage}>{Math.round(progress)}%</span>
              </div>

              {/* Loading steps */}
              <div className={styles.steps}>
                <LoadingStep
                  label="ONNX Runtime"
                  status={progress >= 5 ? 'done' : progress > 0 ? 'loading' : 'pending'}
                />
                <LoadingStep
                  label="TTS 모델"
                  status={progress >= 90 ? 'done' : progress > 10 ? 'loading' : 'pending'}
                />
                <LoadingStep
                  label="음성 스타일"
                  status={progress >= 100 ? 'done' : progress > 90 ? 'loading' : 'pending'}
                />
              </div>
            </div>

            {/* Footer */}
            <div className={styles.footer}>
              <p>음성 주문 시스템을 준비하고 있습니다</p>
              <p className={styles.hint}>
                {isCached ? '캐시된 모델을 사용합니다' : '잠시만 기다려 주세요...'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface LoadingStepProps {
  label: string;
  status: 'pending' | 'loading' | 'done';
}

function LoadingStep({ label, status }: LoadingStepProps) {
  return (
    <div className={`${styles.step} ${styles[status]}`}>
      <div className={styles.stepIcon}>
        {status === 'done' ? (
          <svg viewBox="0 0 16 16" fill="none">
            <path
              d="M3 8l4 4 6-8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : status === 'loading' ? (
          <div className={styles.spinner} />
        ) : (
          <div className={styles.dot} />
        )}
      </div>
      <span className={styles.stepLabel}>{label}</span>
    </div>
  );
}
