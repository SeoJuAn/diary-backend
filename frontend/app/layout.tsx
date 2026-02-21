import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import AdminPanel from "@/components/AdminPanel";

export const metadata: Metadata = {
  title: "Diary - 하루를 기록하세요",
  description: "AI와 함께하는 일기 앱",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          <div className="mockup-scene">
            {/* ── 왼쪽: 아이폰 17 목업 ── */}
            <div className="iphone17">
              <div className="iphone17-btn-action" />
              <div className="iphone17-btn-vol-up" />
              <div className="iphone17-btn-vol-down" />
              <div className="iphone17-btn-power" />
              <div className="iphone17-screen">
                <div className="dynamic-island" />
                <div className="app-container">
                  {children}
                </div>
              </div>
            </div>

            {/* ── 오른쪽: Admin 패널 ── */}
            <AdminPanel />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
