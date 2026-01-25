'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAIStore } from '@/store/aiStore';

interface UseFaceDetectionOptions {
  onFaceDetected?: () => void;
  onFaceLost?: () => void;
  detectionInterval?: number;
}

interface UseFaceDetectionReturn {
  isActive: boolean;
  isFaceDetected: boolean;
  isSupported: boolean;
  isCameraReady: boolean;
  startDetection: () => Promise<void>;
  stopDetection: () => void;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export function useFaceDetection(options: UseFaceDetectionOptions = {}): UseFaceDetectionReturn {
  const {
    onFaceDetected,
    onFaceLost,
    detectionInterval = 500,
  } = options;

  const [isActive, setIsActive] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null!);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<unknown>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastFaceStateRef = useRef(false);

  const setModelStatus = useAIStore((state) => state.setModelStatus);
  const setModelProgress = useAIStore((state) => state.setModelProgress);

  useEffect(() => {
    const checkSupport = async () => {
      const hasMediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
      setIsSupported(hasMediaDevices);

      if (hasMediaDevices) {
        setModelStatus('faceDetection', 'idle');
      }
    };

    checkSupport();

    return () => {
      stopDetection();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFaceDetector = async () => {
    try {
      setModelStatus('faceDetection', 'loading');
      setModelProgress('faceDetection', 10);

      const vision = await import('@mediapipe/tasks-vision');
      setModelProgress('faceDetection', 50);

      const { FaceDetector, FilesetResolver } = vision;

      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );
      setModelProgress('faceDetection', 70);

      const detector = await FaceDetector.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        minDetectionConfidence: 0.5,
      });
      setModelProgress('faceDetection', 100);

      detectorRef.current = detector;
      setModelStatus('faceDetection', 'ready');

      return detector;
    } catch (err) {
      console.error('Face detector load error:', err);
      setModelStatus('faceDetection', 'fallback');
      throw err;
    }
  };

  const startDetection = useCallback(async () => {
    if (!isSupported) {
      setError('카메라를 사용할 수 없습니다.');
      return;
    }

    // Prevent double initialization
    if (streamRef.current) {
      console.log('Camera already active');
      return;
    }

    try {
      setError(null);
      setIsActive(true);

      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              videoRef.current?.play();
              setIsCameraReady(true);
              resolve();
            };
          }
        });
      }

      // Load face detector
      let detector = detectorRef.current;
      if (!detector) {
        try {
          detector = await loadFaceDetector();
        } catch {
          // Fallback: Use simple motion detection or just camera ready state
          console.log('Face detector not available, using fallback');
          setModelStatus('faceDetection', 'fallback');

          // Simple fallback: detect any video activity
          intervalRef.current = setInterval(() => {
            if (videoRef.current && videoRef.current.readyState === 4) {
              // Camera is active, assume face is present after a delay
              if (!lastFaceStateRef.current) {
                lastFaceStateRef.current = true;
                setIsFaceDetected(true);
                onFaceDetected?.();
              }
            }
          }, detectionInterval);
          return;
        }
      }

      // Start detection loop
      const detectFaces = async () => {
        if (!videoRef.current || !detector || videoRef.current.readyState !== 4) {
          return;
        }

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const results = await (detector as any).detectForVideo(
            videoRef.current,
            performance.now()
          );

          const faceDetected = results.detections && results.detections.length > 0;

          if (faceDetected !== lastFaceStateRef.current) {
            lastFaceStateRef.current = faceDetected;
            setIsFaceDetected(faceDetected);

            if (faceDetected) {
              onFaceDetected?.();
            } else {
              onFaceLost?.();
            }
          }
        } catch (err) {
          console.error('Face detection error:', err);
        }
      };

      intervalRef.current = setInterval(detectFaces, detectionInterval);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '카메라 접근에 실패했습니다.';

      if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
        setError('카메라 사용 권한이 거부되었습니다.');
      } else {
        setError(errorMessage);
      }

      setIsActive(false);
      setModelStatus('faceDetection', 'error');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, detectionInterval, onFaceDetected, onFaceLost]);

  const stopDetection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsActive(false);
    setIsCameraReady(false);
    setIsFaceDetected(false);
    lastFaceStateRef.current = false;
  }, []);

  return {
    isActive,
    isFaceDetected,
    isSupported,
    isCameraReady,
    startDetection,
    stopDetection,
    error,
    videoRef,
  };
}
