import { useCallback, useRef, useSyncExternalStore } from 'react';

const SESSION_TIMEOUT = 45; // seconds

interface SessionState {
  isActive: boolean;
  timeLeft: number;
}

/**
 * Session Timer Hook
 *
 * 세션 타임아웃을 관리하는 훅. ref 기반으로 stale closure 문제를 방지합니다.
 *
 * - 활동 감지 시 타이머 리셋
 * - 타임아웃 시 콜백 실행
 * - 세션 시작/정지/리셋 제어
 */
export function useSessionTimer(onTimeout: () => void) {
  // Internal state managed via refs to avoid stale closures
  const isActiveRef = useRef(false);
  const timeLeftRef = useRef(SESSION_TIMEOUT);
  const lastActivityRef = useRef(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeoutRef = useRef(onTimeout);

  // Keep callback ref updated
  onTimeoutRef.current = onTimeout;

  // Subscribers for external store
  const subscribersRef = useRef(new Set<() => void>());

  // Cached snapshot to avoid infinite loop in useSyncExternalStore
  // getSnapshot must return the same object reference if values haven't changed
  const snapshotRef = useRef<SessionState>({
    isActive: false,
    timeLeft: SESSION_TIMEOUT,
  });

  // Update snapshot only when values change (called before notify)
  const updateSnapshot = useCallback(() => {
    const current = snapshotRef.current;
    if (
      current.isActive !== isActiveRef.current ||
      current.timeLeft !== timeLeftRef.current
    ) {
      snapshotRef.current = {
        isActive: isActiveRef.current,
        timeLeft: timeLeftRef.current,
      };
    }
  }, []);

  const notify = useCallback(() => {
    updateSnapshot();
    subscribersRef.current.forEach(cb => cb());
  }, [updateSnapshot]);

  // Subscribe function for useSyncExternalStore
  const subscribe = useCallback((callback: () => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  // Snapshot function for useSyncExternalStore
  // Returns cached snapshot - MUST return same reference if values unchanged
  const getSnapshot = useCallback((): SessionState => {
    return snapshotRef.current;
  }, []);

  // Use external store for reactive state
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Internal tick function
  const tick = useCallback(() => {
    if (!isActiveRef.current) return;

    const elapsed = Math.floor((Date.now() - lastActivityRef.current) / 1000);
    const remaining = Math.max(0, SESSION_TIMEOUT - elapsed);

    if (timeLeftRef.current !== remaining) {
      timeLeftRef.current = remaining;
      notify();
    }

    if (remaining <= 0) {
      // Stop timer and call timeout callback
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      isActiveRef.current = false;
      timeLeftRef.current = SESSION_TIMEOUT;
      notify();

      // Call timeout callback via ref to avoid stale closure
      onTimeoutRef.current();
    }
  }, [notify]);

  // Start session timer
  const startSession = useCallback(() => {
    // Clear existing timer if any
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    isActiveRef.current = true;
    lastActivityRef.current = Date.now();
    timeLeftRef.current = SESSION_TIMEOUT;
    notify();

    // Start interval
    timerRef.current = setInterval(tick, 1000);
  }, [tick, notify]);

  // Stop session timer (used when order is completed)
  const stopSession = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isActiveRef.current = false;
    timeLeftRef.current = SESSION_TIMEOUT;
    notify();
  }, [notify]);

  // Reset activity timer (extends session)
  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    timeLeftRef.current = SESSION_TIMEOUT;

    // Auto-start session if not active
    if (!isActiveRef.current) {
      startSession();
    } else {
      notify();
    }
  }, [startSession, notify]);

  // Full reset (for timeout or manual reset)
  const resetSession = useCallback(() => {
    stopSession();
  }, [stopSession]);

  // Check if session is active
  const isSessionActive = useCallback(() => isActiveRef.current, []);

  return {
    isActive: state.isActive,
    timeLeft: state.timeLeft,
    startSession,
    stopSession,
    resetActivity,
    resetSession,
    isSessionActive,
    SESSION_TIMEOUT,
  };
}
