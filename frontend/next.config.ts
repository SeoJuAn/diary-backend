import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    // 서버 전용 환경변수 사용 (빌드 타임이 아닌 런타임에 평가됨)
    // Docker: FASTAPI_URL=http://fastapi:8000
    // 로컬 개발: FASTAPI_URL=http://localhost:8000
    const apiUrl = process.env.FASTAPI_URL || "http://fastapi:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
