import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

const siteUrl = "https://ai-cafe.stomx.net";
const gaId = "G-TPPYRJVR5M";
const clarityId = "v6ykt0p70s";
const isProduction = process.env.NODE_ENV === "production";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AI Cafe - AI 음성 주문 키오스크",
  description:
    "100% 브라우저 기반 AI 음성 인식 커피 주문 시스템. 서버 없이 로컬에서 실행되는 스마트 키오스크.",
  keywords: ["AI", "음성 주문", "키오스크", "커피", "카페", "음성 인식"],
  authors: [{ name: "AI Cafe" }],
  creator: "AI Cafe",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: siteUrl,
    siteName: "AI Cafe",
    title: "AI Cafe - AI 음성 주문 키오스크",
    description:
      "100% 브라우저 기반 AI 음성 인식 커피 주문 시스템. 서버 없이 로컬에서 실행되는 스마트 키오스크.",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "AI Cafe - AI 음성 주문 키오스크",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Cafe - AI 음성 주문 키오스크",
    description:
      "100% 브라우저 기반 AI 음성 인식 커피 주문 시스템. 서버 없이 로컬에서 실행되는 스마트 키오스크.",
    images: ["/og-image.jpg"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

// JSON-LD 구조화 데이터
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "AI Cafe",
  description:
    "100% 브라우저 기반 AI 음성 인식 커피 주문 시스템",
  url: siteUrl,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web Browser",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "KRW",
  },
  featureList: [
    "음성 인식 주문",
    "얼굴 인식 자동 시작",
    "한국어 TTS 응답",
    "100% 브라우저 기반",
  ],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* Analytics - 프로덕션 환경에서만 로드 */}
        {isProduction && (
          <>
            {/* Google Analytics */}
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
              strategy="afterInteractive"
            />
            <Script id="google-analytics" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaId}');
              `}
            </Script>
            {/* Microsoft Clarity */}
            <Script id="microsoft-clarity" strategy="afterInteractive">
              {`
                (function(c,l,a,r,i,t,y){
                  c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                  t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                  y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
                })(window, document, "clarity", "script", "${clarityId}");
              `}
            </Script>
          </>
        )}
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
        <Script
          id="json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
