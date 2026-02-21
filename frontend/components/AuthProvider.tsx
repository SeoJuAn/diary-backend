"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const initAuth = useAppStore((s) => s.initAuth);

  useEffect(() => {
    // 앱 최초 마운트 시 localStorage에서 토큰/유저 정보 복원
    initAuth();
  }, [initAuth]);

  return <>{children}</>;
}
