'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTextToSpeech } from '@/hooks/useTextToSpeech';
import { getTTSCacheInfo } from '@/lib/tts';
import { useLayoutStore } from '@/store/layoutStore';
import styles from './SplashScreen.module.css';

// FHD 해상도 상수
const FHD_LANDSCAPE = { width: 1920, height: 1080 };
const FHD_PORTRAIT = { width: 1080, height: 1920 };

type Phase = 'loading' | 'transitioning' | 'ready';

// 모바일 기기 감지 (ONNX 로딩 건너뛰기 용)
const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isMobile = window.innerWidth <= 768;
  const isPortraitScreen = window.innerHeight > window.innerWidth;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  return isMobile || (isPortraitScreen && isTouchDevice);
};

interface SplashScreenProps {
  onStart: () => void;
  skipLoading?: boolean;
}

export function SplashScreen({ onStart, skipLoading = false }: SplashScreenProps) {
  const [phase, setPhase] = useState<Phase>(skipLoading ? 'ready' : 'loading');
  const [loadingMessage, setLoadingMessage] = useState('서비스 준비 중...');
  const [progress, setProgress] = useState(0);
  const [isCached, setIsCached] = useState(false);
  const [isOrientationReady, setIsOrientationReady] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const orientation = useLayoutStore((state) => state.orientation);
  const initOrientation = useLayoutStore((state) => state.initOrientation);
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

  // 먼저 orientation 초기화 및 모바일 감지 (TTS 로딩 전에 완료)
  useEffect(() => {
    initOrientation();
    setIsMobile(isMobileDevice());
    setIsOrientationReady(true);
  }, [initOrientation]);

  useEffect(() => {
    if (!isOrientationReady) return;
    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [calculateScale, isOrientationReady]);

  const handleLoadProgress = useCallback((prog: number, message: string) => {
    setProgress(prog);
    setLoadingMessage(message);
  }, []);

  const handleLoadError = useCallback(() => {
    setLoadingMessage('기본 음성 엔진으로 전환...');
  }, []);

  const { loadSupertonic, activateWebSpeech } = useTextToSpeech({
    onLoadProgress: handleLoadProgress,
    onError: handleLoadError,
    preferSupertonic: true,
  });

  // 시작 버튼 클릭 핸들러 (iOS Web Speech API 활성화 포함)
  const handleStart = useCallback(() => {
    // iOS에서 Web Speech API 활성화 (사용자 인터랙션 컨텍스트 내에서 호출 필요)
    activateWebSpeech();
    onStart();
  }, [activateWebSpeech, onStart]);

  // Start loading (orientation 초기화 후)
  useEffect(() => {
    if (skipLoading || !isOrientationReady) return;

    let mounted = true;

    const startLoading = async () => {
      try {
        // 모바일에서는 ONNX 로딩 건너뛰기 (메모리 부족으로 크래시 방지)
        if (isMobile) {
          console.log('[SplashScreen] 모바일 기기 감지 - Web Speech API 사용');
          setLoadingMessage('모바일 음성 엔진 준비 중...');
          setProgress(50);

          // 짧은 딜레이 후 바로 준비 완료
          await new Promise(resolve => setTimeout(resolve, 500));

          if (!mounted) return;
          setProgress(100);
          setLoadingMessage('준비 완료!');

          setTimeout(() => {
            if (mounted) setPhase('transitioning');
          }, 400);

          setTimeout(() => {
            if (mounted) setPhase('ready');
          }, 1000);
          return;
        }

        // 데스크톱: ONNX TTS 로딩
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
        } else {
          setLoadingMessage('기본 음성 엔진으로 전환...');
        }

        // Start transition after brief delay
        setTimeout(() => {
          if (mounted) {
            setPhase('transitioning');
          }
        }, 600);

        // Complete transition
        setTimeout(() => {
          if (mounted) {
            setPhase('ready');
          }
        }, 1400);
      } catch (err) {
        if (!mounted) return;
        console.error('[SplashScreen] Load error:', err);
        setLoadingMessage('기본 음성 엔진으로 전환...');

        setTimeout(() => {
          if (mounted) setPhase('transitioning');
        }, 800);

        setTimeout(() => {
          if (mounted) setPhase('ready');
        }, 1600);
      }
    };

    startLoading();

    return () => {
      mounted = false;
    };
  }, [loadSupertonic, skipLoading, isOrientationReady, isMobile]);

  const isLoading = phase === 'loading';
  const isReady = phase === 'ready';

  // Brand component (shared between loading and ready states)
  const BrandSection = (
    <>
      <div className={styles.logoMark}>
        <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M16 24h28c0 16-6 24-14 24S16 40 16 24z"
            fill="currentColor"
            opacity="0.15"
          />
          <path
            d="M16 24h28c0 16-6 24-14 24S16 40 16 24z"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M44 28c4 0 8 2 8 8s-4 8-8 8"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
          <path
            d="M24 16c0-4 4-4 4-8M30 16c0-4 4-4 4-8M36 16c0-4 4-4 4-8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            className={styles.steam}
          />
        </svg>
      </div>
      <h1 className={styles.title}>AI Cafe</h1>
      <p className={styles.tagline}>Midnight Roast</p>
    </>
  );

  const fhd = orientation === 'landscape' ? FHD_LANDSCAPE : FHD_PORTRAIT;

  // 모바일에서는 전체 화면 사용 (FHD 스케일링 없음)
  if (isMobile) {
    return (
      <div className={`${styles.container} ${styles.mobileContainer}`}>
        {/* Subtle grain texture */}
        <div className={styles.grain} />

        {/* Ambient glow */}
        <div className={`${styles.ambientGlow} ${isReady ? styles.glowReady : ''}`} />

        {/* Loading View */}
        <div className={`${styles.loadingView} ${!isLoading ? styles.loadingHidden : ''}`}>
          <div className={styles.loadingBrand}>
            {BrandSection}
          </div>

          <div className={styles.loader}>
            <div className={styles.progressContainer}>
              <div
                className={styles.progressBar}
                style={{ width: `${progress}%` }}
              />
              <div className={styles.progressGlow} style={{ left: `${progress}%` }} />
            </div>

            <div className={styles.status}>
              <span className={styles.message}>{loadingMessage}</span>
              <span className={styles.percentage}>{Math.round(progress)}%</span>
            </div>

            <div className={styles.loadingFooter}>
              <p>음성 주문 시스템을 준비하고 있습니다</p>
              <p className={styles.hint}>
                {isCached ? '캐시된 모델을 사용합니다' : '잠시만 기다려 주세요...'}
              </p>
            </div>
          </div>
        </div>

        {/* Ready View - Mobile optimized */}
        <div className={`${styles.readyView} ${isReady ? styles.readyVisible : ''}`}>
          <div className={styles.readyBrand}>
            {BrandSection}
          </div>

          <div className={styles.mainContent}>
            <p className={styles.heroDesc}>
              100% 브라우저 기반 AI 음성 주문 시스템
              <br />
              <span className={styles.highlight}>서버 없이, 로컬에서 실행</span>
            </p>

            <div className={styles.techPills}>
              <span className={styles.techPill}>
                <span className={styles.pillIcon}>👁️</span>
                <span>MediaPipe</span>
              </span>
              <span className={styles.techPill}>
                <span className={styles.pillIcon}>🎤</span>
                <span>Web Speech</span>
              </span>
            </div>

            <button className={styles.startButton} onClick={handleStart}>
              <span className={styles.startIcon}>☕</span>
              <span>시작하기</span>
            </button>

            <div className={styles.divider} />

            <div className={styles.featuresRow}>
              <div className={styles.featureItem}>
                <span className={styles.featureIcon}>👁️</span>
                <div>
                  <strong>얼굴 인식</strong>
                  <p>자동 시작</p>
                </div>
              </div>
              <div className={styles.featureItem}>
                <span className={styles.featureIcon}>🎤</span>
                <div>
                  <strong>음성 주문</strong>
                  <p>한국어</p>
                </div>
              </div>
              <div className={styles.featureItem}>
                <span className={styles.featureIcon}>🔊</span>
                <div>
                  <strong>음성 응답</strong>
                  <p>TTS</p>
                </div>
              </div>
            </div>

            <div className={styles.scenarioSection}>
              <h3 className={styles.sectionLabel}>테스트 시나리오</h3>
              <div className={styles.scenarioGrid}>
                <div className={styles.scenarioCard}>
                  <span className={styles.scenarioNum}>01</span>
                  <p>&quot;아이스 아메리카노 한 잔&quot;</p>
                </div>
                <div className={styles.scenarioCard}>
                  <span className={styles.scenarioNum}>02</span>
                  <p>&quot;카페라떼 하나요&quot;</p>
                </div>
              </div>
            </div>

            <div className={styles.notices}>
              <div className={styles.noticeItem}>
                <span className={styles.noticeIcon}>🌐</span>
                <span><strong>Chrome</strong> 권장</span>
              </div>
              <div className={styles.noticeDot} />
              <div className={styles.noticeItem}>
                <span className={styles.noticeIcon}>⏱️</span>
                <span>30초 리셋</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <p>AI Cafe · Midnight Roast</p>
          <p className={styles.footerCredit}>
            Made by <a href="https://stomx.net/about" target="_blank" rel="noopener noreferrer">Jaymon</a>
          </p>
        </footer>
      </div>
    );
  }

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
          {/* Subtle grain texture */}
          <div className={styles.grain} />

          {/* Ambient glow */}
          <div className={`${styles.ambientGlow} ${isReady ? styles.glowReady : ''}`} />

          {/* Loading View - Centered flex layout */}
          <div className={`${styles.loadingView} ${!isLoading ? styles.loadingHidden : ''}`}>
            <div className={styles.loadingBrand}>
              {BrandSection}
            </div>

            <div className={styles.loader}>
              <div className={styles.progressContainer}>
                <div
                  className={styles.progressBar}
                  style={{ width: `${progress}%` }}
                />
                <div className={styles.progressGlow} style={{ left: `${progress}%` }} />
              </div>

              <div className={styles.status}>
                <span className={styles.message}>{loadingMessage}</span>
                <span className={styles.percentage}>{Math.round(progress)}%</span>
              </div>

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

              <div className={styles.loadingFooter}>
                <p>음성 주문 시스템을 준비하고 있습니다</p>
                <p className={styles.hint}>
                  {isCached ? '캐시된 모델을 사용합니다' : '잠시만 기다려 주세요...'}
                </p>
              </div>
            </div>
          </div>

          {/* Ready View - Brand at top, content below */}
          <div className={`${styles.readyView} ${isReady ? styles.readyVisible : ''}`}>
            <div className={styles.readyBrand}>
              {BrandSection}
            </div>

            <div className={styles.mainContent}>
              <p className={styles.heroDesc}>
                100% 브라우저 기반 AI 음성 주문 시스템
                <br />
                <span className={styles.highlight}>서버 없이, 로컬에서 실행</span>
              </p>

              <div className={styles.techPills}>
                <span className={styles.techPill}>
                  <span className={styles.pillIcon}>👁️</span>
                  <span>MediaPipe</span>
                </span>
                <span className={styles.techPill}>
                  <span className={styles.pillIcon}>🎤</span>
                  <span>Web Speech</span>
                </span>
                <span className={styles.techPill}>
                  <span className={styles.pillIcon}>🔊</span>
                  <span>Supertonic TTS</span>
                </span>
              </div>

              <button className={styles.startButton} onClick={handleStart}>
                <span className={styles.startIcon}>☕</span>
                <span>시작하기</span>
              </button>

              <div className={styles.divider} />

              <div className={styles.featuresRow}>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>👁️</span>
                  <div>
                    <strong>얼굴 인식</strong>
                    <p>자동 인사 시작</p>
                  </div>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>🎤</span>
                  <div>
                    <strong>음성 주문</strong>
                    <p>한국어 인식</p>
                  </div>
                </div>
                <div className={styles.featureItem}>
                  <span className={styles.featureIcon}>🔊</span>
                  <div>
                    <strong>음성 응답</strong>
                    <p>자연스러운 TTS</p>
                  </div>
                </div>
              </div>

              <div className={styles.scenarioSection}>
                <h3 className={styles.sectionLabel}>테스트 시나리오</h3>
                <div className={styles.scenarioGrid}>
                  <div className={styles.scenarioCard}>
                    <span className={styles.scenarioNum}>01</span>
                    <p>&quot;아이스 아메리카노 한 잔 주세요&quot;</p>
                  </div>
                  <div className={styles.scenarioCard}>
                    <span className={styles.scenarioNum}>02</span>
                    <p>&quot;카페라떼 하나요&quot; → &quot;따뜻하게&quot;</p>
                  </div>
                  <div className={styles.scenarioCard}>
                    <span className={styles.scenarioNum}>03</span>
                    <p>&quot;아아 두 잔이랑 핫 카푸치노 하나&quot;</p>
                  </div>
                </div>
              </div>

              <div className={styles.notices}>
                <div className={styles.noticeItem}>
                  <span className={styles.noticeIcon}>🌐</span>
                  <span><strong>Chrome/Edge</strong> 권장</span>
                </div>
                <div className={styles.noticeDot} />
                <div className={styles.noticeItem}>
                  <span className={styles.noticeIcon}>⚡</span>
                  <span>규칙 기반 NLU</span>
                </div>
                <div className={styles.noticeDot} />
                <div className={styles.noticeItem}>
                  <span className={styles.noticeIcon}>⏱️</span>
                  <span>30초 자동 리셋</span>
                </div>
              </div>

              <div className={styles.tipsBar}>
                <span className={styles.tipLabel}>💡 TIP</span>
                <span className={styles.tipText}>TTS 재생 중에도 음성 입력 가능 (Barge-in)</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <footer className={styles.footer}>
            <p>AI Cafe · Midnight Roast Edition</p>
            <p className={styles.footerCredit}>
              Made by <a href="https://stomx.net/about" target="_blank" rel="noopener noreferrer">Jaymon</a> · <a href="https://stomx.net" target="_blank" rel="noopener noreferrer">stomx.net</a>
            </p>
          </footer>
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
