'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui';
import { WaveformIndicator } from '@/components/ui/WaveformIndicator';

type VoiceState = 'idle' | 'listening' | 'timeout' | 'success';

interface VoiceOrderButtonProps {
  voiceState?: VoiceState;
  isListening?: boolean;
  onStartListening?: () => void;
  onStopListening?: () => void;
  disabled?: boolean;
}

export function VoiceOrderButton({
  voiceState = 'idle',
  isListening = false,
  onStartListening,
  onStopListening,
  disabled,
}: VoiceOrderButtonProps) {
  const handleClick = useCallback(() => {
    if (disabled) return;

    if (isListening) {
      onStopListening?.();
    } else {
      onStartListening?.();
    }
  }, [disabled, isListening, onStartListening, onStopListening]);

  const getButtonText = () => {
    if (isListening) return '듣는 중...';
    if (voiceState === 'timeout') return '다시 시도';
    return '음성으로 주문하기';
  };

  const getHintText = () => {
    switch (voiceState) {
      case 'timeout':
        return '버튼을 눌러 음성 주문을 시작하세요';
      case 'success':
        return '주문이 인식되었습니다';
      case 'listening':
        return '지금 말씀하세요...';
      default:
        return '얼굴 인식 시 자동으로 시작됩니다';
    }
  };

  return (
    <div className="voice-order-container">
      <Button
        variant={isListening ? 'primary' : 'secondary'}
        size="md"
        onClick={handleClick}
        disabled={disabled}
        className={`voice-order-btn ${isListening ? 'shimmer' : ''}`}
      >
        {isListening ? (
          <>
            <WaveformIndicator isActive={true} barCount={5} />
            <span>{getButtonText()}</span>
          </>
        ) : (
          <>
            <span className="text-xl">🎤</span>
            <span>{getButtonText()}</span>
          </>
        )}
      </Button>
      <p className="voice-hint">
        {isListening && <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-primary)] mr-2 animate-pulse" />}
        {getHintText()}
      </p>
    </div>
  );
}
