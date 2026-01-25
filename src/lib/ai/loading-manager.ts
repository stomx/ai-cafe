import { useAIStore } from '@/store/aiStore';
import { checkBrowserSupport, type BrowserSupport } from '@/lib/utils/browser-support';

export type AIModel = 'faceDetection' | 'stt' | 'tts' | 'llm';

interface LoadingPhase {
  models: AIModel[];
  trigger: 'immediate' | 'idle' | 'interaction';
}

const LOADING_PHASES: LoadingPhase[] = [
  { models: ['faceDetection'], trigger: 'immediate' },  // ~3MB, 2-3s
  { models: ['tts'], trigger: 'idle' },                 // ~85MB, 5-10s
  { models: ['stt', 'llm'], trigger: 'interaction' },   // ~1.25GB
];

export class AILoadingManager {
  private loadedModels: Set<AIModel> = new Set();
  private loadingPromises: Map<AIModel, Promise<void>> = new Map();

  async loadPhase(trigger: LoadingPhase['trigger']): Promise<void> {
    const phase = LOADING_PHASES.find(p => p.trigger === trigger);
    if (!phase) return;

    const modelsToLoad = phase.models.filter(m => !this.loadedModels.has(m));
    await Promise.all(modelsToLoad.map(model => this.loadModel(model)));
  }

  async loadModel(model: AIModel): Promise<void> {
    if (this.loadedModels.has(model)) return;
    if (this.loadingPromises.has(model)) {
      return this.loadingPromises.get(model);
    }

    const store = useAIStore.getState();
    const support = checkBrowserSupport();

    const loadPromise = (async () => {
      try {
        store.setModelStatus(model, 'loading');
        store.setModelProgress(model, 0);

        // Model-specific loading will be implemented in each feature branch
        // For now, just simulate the structure
        await this.initializeModel(model, support);

        this.loadedModels.add(model);
        store.setModelStatus(model, 'ready');
        store.setModelProgress(model, 100);
      } catch (error) {
        console.error(`Failed to load ${model}:`, error);
        store.setModelError(model, error instanceof Error ? error.message : 'Unknown error');

        // Try fallback
        await this.initializeFallback(model);
      }
    })();

    this.loadingPromises.set(model, loadPromise);
    return loadPromise;
  }

  private async initializeModel(model: AIModel, support: BrowserSupport): Promise<void> {
    // Placeholder - actual implementation in feature branches
    switch (model) {
      case 'faceDetection':
        if (!support.mediaDevices) throw new Error('Camera not available');
        break;
      case 'stt':
        if (!support.wasm) throw new Error('WebAssembly not supported');
        break;
      case 'tts':
        if (!support.audioContext) throw new Error('Audio not supported');
        break;
      case 'llm':
        if (!support.webgpu && !support.webgl2) throw new Error('WebGPU/WebGL2 required');
        break;
    }
  }

  private async initializeFallback(model: AIModel): Promise<void> {
    const store = useAIStore.getState();

    switch (model) {
      case 'faceDetection':
        // Fallback: manual start button (no auto-detection)
        store.setModelStatus('faceDetection', 'fallback');
        break;
      case 'stt':
        // Fallback: Web Speech API
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
          store.setModelStatus('stt', 'fallback');
        }
        break;
      case 'tts':
        // Fallback: Web Speech Synthesis
        if ('speechSynthesis' in window) {
          store.setModelStatus('tts', 'fallback');
        }
        break;
      case 'llm':
        // Fallback: rule-based parsing
        store.setModelStatus('llm', 'fallback');
        break;
    }
  }
}

export const aiLoadingManager = new AILoadingManager();
