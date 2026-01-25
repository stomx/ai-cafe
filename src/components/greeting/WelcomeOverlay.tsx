'use client';

import { useEffect, useState } from 'react';

interface WelcomeOverlayProps {
  isVisible: boolean;
  onDismiss?: () => void;
  autoHideDelay?: number;
}

export function WelcomeOverlay({
  isVisible,
  onDismiss,
  autoHideDelay = 3000,
}: WelcomeOverlayProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });

      const timer = setTimeout(() => {
        setIsAnimating(false);
        setTimeout(() => {
          setShouldRender(false);
          onDismiss?.();
        }, 400);
      }, autoHideDelay);

      return () => clearTimeout(timer);
    }
  }, [isVisible, autoHideDelay, onDismiss]);

  if (!shouldRender) return null;

  return (
    <div
      className={`welcome-overlay ${isAnimating ? 'visible' : ''}`}
      onClick={() => {
        setIsAnimating(false);
        setTimeout(() => {
          setShouldRender(false);
          onDismiss?.();
        }, 400);
      }}
    >
      <div className="welcome-content">
        {/* Coffee cup animation */}
        <div className="welcome-icon">
          <div className="coffee-cup">
            <div className="steam">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="cup-emoji">☕</span>
          </div>
        </div>

        <h2 className="welcome-title">안녕하세요!</h2>
        <p className="welcome-subtitle">AI Cafe가 도와드릴게요</p>

        <div className="welcome-divider">
          <span></span>
          <span className="divider-icon">✦</span>
          <span></span>
        </div>

        <p className="welcome-hint">음성 또는 터치로 주문해주세요</p>

        <div className="welcome-voice-indicator">
          <div className="voice-ring"></div>
          <div className="voice-ring"></div>
          <div className="voice-ring"></div>
        </div>
      </div>

      <style jsx>{`
        .welcome-overlay {
          position: fixed;
          inset: 0;
          background: rgba(13, 11, 9, 0.92);
          backdrop-filter: blur(24px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          opacity: 0;
          transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .welcome-overlay.visible {
          opacity: 1;
        }

        .welcome-content {
          text-align: center;
          transform: scale(0.92) translateY(20px);
          opacity: 0;
          transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .welcome-overlay.visible .welcome-content {
          transform: scale(1) translateY(0);
          opacity: 1;
        }

        .welcome-icon {
          margin-bottom: 32px;
        }

        .coffee-cup {
          position: relative;
          display: inline-block;
        }

        .cup-emoji {
          font-size: 96px;
          display: block;
          filter: drop-shadow(0 0 40px rgba(201, 166, 107, 0.4));
          animation: cupFloat 3s ease-in-out infinite;
        }

        @keyframes cupFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }

        .steam {
          position: absolute;
          top: -30px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
        }

        .steam span {
          width: 4px;
          height: 20px;
          background: linear-gradient(to top, rgba(201, 166, 107, 0.6), transparent);
          border-radius: 10px;
          animation: steamRise 2s ease-in-out infinite;
        }

        .steam span:nth-child(1) { animation-delay: 0s; height: 16px; }
        .steam span:nth-child(2) { animation-delay: 0.3s; height: 24px; }
        .steam span:nth-child(3) { animation-delay: 0.6s; height: 16px; }

        @keyframes steamRise {
          0% {
            opacity: 0;
            transform: translateY(0) scaleY(0.5);
          }
          50% {
            opacity: 1;
            transform: translateY(-10px) scaleY(1);
          }
          100% {
            opacity: 0;
            transform: translateY(-24px) scaleY(0.5);
          }
        }

        .welcome-title {
          font-family: 'Playfair Display', serif;
          font-size: clamp(40px, 5vw, 56px);
          font-weight: 600;
          margin-bottom: 12px;
          background: linear-gradient(135deg, #C9A66B 0%, #E4C896 50%, #C9A66B 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: 0.02em;
        }

        .welcome-subtitle {
          font-size: clamp(18px, 2vw, 24px);
          color: #C4BDB3;
          margin-bottom: 32px;
          font-weight: 400;
        }

        .welcome-divider {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-bottom: 32px;
        }

        .welcome-divider span:first-child,
        .welcome-divider span:last-child {
          width: 80px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(201, 166, 107, 0.5), transparent);
        }

        .divider-icon {
          color: #C9A66B;
          font-size: 12px;
          animation: sparkle 2s ease-in-out infinite;
        }

        @keyframes sparkle {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }

        .welcome-hint {
          font-size: 16px;
          color: #7A7167;
          margin-bottom: 40px;
        }

        .welcome-voice-indicator {
          position: relative;
          width: 60px;
          height: 60px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .voice-ring {
          position: absolute;
          width: 100%;
          height: 100%;
          border: 2px solid rgba(201, 166, 107, 0.3);
          border-radius: 50%;
          animation: voiceRing 2s ease-out infinite;
        }

        .voice-ring:nth-child(2) { animation-delay: 0.4s; }
        .voice-ring:nth-child(3) { animation-delay: 0.8s; }

        @keyframes voiceRing {
          0% {
            transform: scale(0.5);
            opacity: 1;
          }
          100% {
            transform: scale(1.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
