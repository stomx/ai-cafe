export interface BrowserSupport {
  webgpu: boolean;
  webgl2: boolean;
  wasm: boolean;
  sharedArrayBuffer: boolean;
  mediaDevices: boolean;
  speechRecognition: boolean;
  speechSynthesis: boolean;
  audioContext: boolean;
}

export function checkBrowserSupport(): BrowserSupport {
  const support: BrowserSupport = {
    webgpu: false,
    webgl2: false,
    wasm: false,
    sharedArrayBuffer: false,
    mediaDevices: false,
    speechRecognition: false,
    speechSynthesis: false,
    audioContext: false,
  };

  if (typeof window === 'undefined') return support;

  // WebGPU (preferred for AI models)
  support.webgpu = 'gpu' in navigator;

  // WebGL2 (fallback for some operations)
  try {
    const canvas = document.createElement('canvas');
    support.webgl2 = !!canvas.getContext('webgl2');
  } catch {
    support.webgl2 = false;
  }

  // WebAssembly
  support.wasm = typeof WebAssembly !== 'undefined';

  // SharedArrayBuffer (needed for some AI models)
  support.sharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';

  // Media Devices (camera, microphone)
  support.mediaDevices = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  // Speech Recognition (Web Speech API)
  support.speechRecognition = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

  // Speech Synthesis
  support.speechSynthesis = 'speechSynthesis' in window;

  // Audio Context
  support.audioContext = 'AudioContext' in window || 'webkitAudioContext' in window;

  return support;
}

export function getRecommendedFallbacks(support: BrowserSupport): string[] {
  const fallbacks: string[] = [];

  if (!support.webgpu && !support.webgl2) {
    fallbacks.push('LLM will use rule-based parsing (no WebGPU/WebGL2)');
  }

  if (!support.mediaDevices) {
    fallbacks.push('Face detection disabled (no camera access)');
  }

  if (!support.sharedArrayBuffer) {
    fallbacks.push('Some AI models may run slower (no SharedArrayBuffer)');
  }

  return fallbacks;
}
