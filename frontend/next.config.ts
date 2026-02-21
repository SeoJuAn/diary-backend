import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // 로컬 개발 시에만 백엔드 서버(3001)로 프록시
    // Vercel 배포 시에는 /api/* 가 루트의 api/ Serverless Functions로 자동 라우팅되므로 불필요
    if (process.env.NODE_ENV !== "development") return [];

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
