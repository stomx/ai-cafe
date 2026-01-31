/** @type {import('next').NextConfig} */

const isProduction = process.env.NODE_ENV === 'production';

const nextConfig = {
  // Static Export는 프로덕션 빌드에서만 적용
  ...(isProduction && { output: 'export' }),
  images: {
    unoptimized: true,
  },
  // 로컬 개발에서만 headers 적용 (Static Export에서는 public/_headers 사용)
  ...(!isProduction && {
    async headers() {
      return [
        {
          source: '/:path*',
          headers: [
            {
              key: 'Cross-Origin-Opener-Policy',
              value: 'same-origin',
            },
            {
              key: 'Cross-Origin-Embedder-Policy',
              value: 'credentialless',
            },
          ],
        },
      ];
    },
  }),
  // Turbopack 설정 (Next.js 16 기본 번들러)
  turbopack: {
    resolveAlias: {
      fs: { browser: './src/lib/empty.js' },
      path: { browser: './src/lib/empty.js' },
      module: { browser: './src/lib/empty.js' },
    },
  },
  // Webpack 폴백 (Turbopack 미지원 기능용)
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      module: false,
    };

    return config;
  },
};

export default nextConfig;
