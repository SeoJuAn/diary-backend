"use client";

import { usePathname, useRouter } from "next/navigation";

const tabs = [
  {
    key: "home",
    href: "/home",
    label: "대화",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="22" />
      </svg>
    ),
  },
  {
    key: "history",
    href: "/history",
    label: "기록",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth={active ? 2.5 : 1.8}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const activeKey =
    pathname.startsWith("/history") || pathname.startsWith("/summary")
      ? "history"
      : "home";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "transparent" }}>
      {/* Dynamic Island safe area */}
      <div className="safe-top" />

      {/* 페이지 콘텐츠 */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        {children}
      </div>

      {/* 하단 탭바 — Liquid Glass */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-around",
        padding: "8px 16px 12px",
        flexShrink: 0,
        background: "rgba(255,255,255,0.06)",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
        borderTop: "1px solid rgba(255,255,255,0.10)",
      }}>
        {tabs.map((tab) => {
          const isActive = activeKey === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => router.push(tab.href)}
              style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", gap: "2px",
                padding: "6px 20px", borderRadius: "16px",
                border: "none", cursor: "pointer",
                background: isActive ? "rgba(124,92,252,0.18)" : "transparent",
                color: isActive ? "#a78bfa" : "rgba(255,255,255,0.35)",
                transition: "all 0.2s",
              }}
            >
              {tab.icon(isActive)}
              <span style={{ fontSize: "10px", fontWeight: 600 }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
