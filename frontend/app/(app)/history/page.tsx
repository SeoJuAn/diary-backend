"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { historyApi } from "@/lib/api";

export default function HistoryPage() {
  const { accessToken, user } = useAppStore();
  const router = useRouter();

  const [sessions, setSessions] = useState<{
    id: string;
    session_id: string;
    started_at: string;
    one_liner?: string;
    emotions?: string;
    keywords?: string;
    duration_seconds: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !accessToken) { router.push("/login"); return; }
    setLoading(true);
    historyApi
      .getHistory({ limit: 30 })
      .then((res) => setSessions(res.data.sessions || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [accessToken, user, router]);

  const fmt = (s: number) => (s < 60 ? `${s}초` : `${Math.floor(s / 60)}분`);
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("ko-KR", {
      month: "short", day: "numeric", weekday: "short",
    });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "transparent" }}>
      {/* 헤더 */}
      <div style={{ padding: "12px 20px 8px" }}>
        <div style={{ fontSize: "16px", fontWeight: 700, color: "#f0eeff" }}>대화 기록</div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginTop: "2px" }}>이전 대화들을 확인해보세요</div>
      </div>

      {/* 목록 */}
      <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "0 16px 12px" }}>
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "120px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(124,92,252,0.3)", borderTopColor: "#7C5CFC", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : sessions.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "120px", gap: "8px" }}>
            <span style={{ fontSize: "32px" }}>💬</span>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,0.35)", textAlign: "center", lineHeight: 1.6 }}>아직 대화 기록이 없어요<br/>첫 대화를 시작해보세요</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {sessions.map((s) => {
              const keywords = s.keywords ? JSON.parse(s.keywords).slice(0, 3) : [];
              const emotions = s.emotions ? JSON.parse(s.emotions).slice(0, 2) : [];
              return (
                <div key={s.id} onClick={() => router.push(`/summary?sessionId=${s.session_id}`)} style={{
                  padding: "12px 14px", borderRadius: "16px", cursor: "pointer",
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)",
                  transition: "all 0.15s",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "4px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "11px", fontWeight: 600, color: "#a78bfa", marginBottom: "2px" }}>{fmtDate(s.started_at)}</div>
                      <div style={{ fontSize: "13px", fontWeight: 500, color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.one_liner || "대화 기록"}
                      </div>
                    </div>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginLeft: "8px", flexShrink: 0 }}>{fmt(s.duration_seconds)}</span>
                  </div>
                  {(keywords.length > 0 || emotions.length > 0) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
                      {emotions.map((e: string, i: number) => (
                        <span key={i} style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "8px", background: "rgba(124,92,252,0.20)", color: "#a78bfa" }}>{e}</span>
                      ))}
                      {keywords.map((k: string, i: number) => (
                        <span key={i} style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "8px", background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>{k}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
