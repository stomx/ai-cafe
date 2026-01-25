import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const MODELS = [
  'duration_predictor.onnx',
  'text_encoder.onnx',
  'vector_estimator.onnx',
  'vocoder.onnx',
];

const BASE_URL = 'https://github.com/stomx/ai-cafe/releases/download/v1.0.0';
const OUTPUT_DIR = 'public/tts/onnx';

async function downloadFile(filename) {
  const url = `${BASE_URL}/${filename}`;
  const outputPath = `${OUTPUT_DIR}/${filename}`;

  if (existsSync(outputPath)) {
    console.log(`✓ ${filename} (이미 존재)`);
    return;
  }

  console.log(`↓ ${filename} 다운로드 중...`);

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`다운로드 실패: ${filename} (${response.status})`);
  }

  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(outputPath)
  );

  console.log(`✓ ${filename} 완료`);
}

async function main() {
  console.log('TTS 모델 다운로드 시작...\n');

  // 디렉토리 생성
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 병렬 다운로드
  await Promise.all(MODELS.map(downloadFile));

  console.log('\n모든 모델 다운로드 완료!');
}

main().catch((err) => {
  console.error('에러:', err.message);
  process.exit(1);
});
