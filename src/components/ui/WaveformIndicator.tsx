'use client';

interface WaveformIndicatorProps {
  isActive: boolean;
  barCount?: number;
}

export function WaveformIndicator({ isActive, barCount = 5 }: WaveformIndicatorProps) {
  return (
    <div className="waveform-indicator" data-active={isActive}>
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          className="waveform-bar"
          style={{ animationDelay: `${i * 0.1}s` }}
        />
      ))}
    </div>
  );
}
