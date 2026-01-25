'use client';

import { OrderList } from './OrderList';
import { OrderSummary } from './OrderSummary';
import { VoiceOrderButton } from './VoiceOrderButton';
import { OrderActions } from './OrderActions';

type VoiceState = 'idle' | 'listening' | 'timeout' | 'success';

interface OrderSectionProps {
  onConfirmOrder: () => void;
  onVoiceResult?: (text: string) => void;
  voiceState?: VoiceState;
  isListening?: boolean;
  onStartListening?: () => void;
  onStopListening?: () => void;
}

export function OrderSection({
  onConfirmOrder,
  voiceState = 'idle',
  isListening = false,
  onStartListening,
  onStopListening,
}: OrderSectionProps) {
  return (
    <div className="order-section-content">
      <h2 className="order-section-title">
        <span className="text-[var(--color-primary)]">✦</span>
        <span className="font-display">현재 주문</span>
      </h2>

      <div className="order-list-container">
        <OrderList />
      </div>

      <div className="order-voice-section">
        <VoiceOrderButton
          voiceState={voiceState}
          isListening={isListening}
          onStartListening={onStartListening}
          onStopListening={onStopListening}
        />
      </div>

      <div className="order-footer">
        <OrderSummary />
        <OrderActions onConfirm={onConfirmOrder} />
      </div>
    </div>
  );
}
