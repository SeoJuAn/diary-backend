"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { realtimeApi } from "@/lib/api";
import { realtimeClient } from "@/lib/webrtc";
import VoiceOrb from "@/components/VoiceOrb";

export default function HomePage() {
  const router = useRouter();
  const {
    user, accessToken,
    voiceStatus, setVoiceStatus,
    setSessionId, startSession, clearSession,
    messages, addMessage, clearMessages, clearSummary,
  } = useAppStore();

  const [elapsedSec, setElapsedSec] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!user || !accessToken) router.push("/login");
  }, [user, accessToken, router]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (voiceStatus === "listening" || voiceStatus === "speaking" || voiceStatus === "processing") {
      timer = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    } else if (voiceStatus === "ended" || voiceStatus === "idle") {
      setElapsedSec(0);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [voiceStatus]);

  const startRecording = useCallback(async () => {
    if (!accessToken) return;
    clearMessages(); clearSummary(); startSession();
    setStarted(true);
    try {
      const tokenRes = await realtimeApi.getToken({
        sessionConfig: { model: "gpt-4o-realtime-preview-2024-12-17" },
      });
      const { token, sessionId: sid } = tokenRes.data;
      setSessionId(sid);
      await realtimeClient.connect(token, "gpt-4o-realtime-preview-2024-12-17", {
        onStatusChange: (s) => setVoiceStatus(s),
        onUserTranscript: (text) => { if (text.trim()) addMessage({ role: "user", content: text }); },
        onAssistantTranscript: (text, isDone) => { if (isDone && text.trim()) addMessage({ role: "assistant", content: text }); },
        onError: (err) => { console.error("WebRTC Error:", err); setVoiceStatus("ended"); },
        onToolCall: async () => ({}),
      }, accessToken);
    } catch (err) {
      console.error("Failed to start session:", err);
      setVoiceStatus("ended");
    }
  }, [accessToken, clearMessages, clearSummary, startSession, setSessionId, setVoiceStatus, addMessage]);

  const handleFinish = () => {
    realtimeClient.disconnect();
    clearSession();
    router.push("/summary");
  };

  const handleStop = () => {
    realtimeClient.disconnect();
    setVoiceStatus("idle");
    setStarted(false);
    clearMessages();
    clearSummary();
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const today = new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  const isActive = ["listening","speaking","processing","connecting"].includes(voiceStatus);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "transparent" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px 8px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>{today}</div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: "#f0eeff" }}>실시간 대화</div>
        </div>
        {isActive && (
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "5px 12px", borderRadius: "20px",
            background: "rgba(124,92,252,0.20)",
            border: "1px solid rgba(124,92,252,0.35)",
          }}>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#a78bfa", animation: "pulse 1s infinite" }} />
            <span style={{ fontSize: "12px", fontFamily: "monospace", fontWeight: 700, color: "#a78bfa" }}>{fmt(elapsedSec)}</span>
          </div>
        )}
      </div>

      {/* VoiceOrb */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", padding: "0 20px" }}>
        <VoiceOrb status={voiceStatus} />

        <div style={{ textAlign: "center" }}>
          {!started && <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>버튼을 눌러<br/>AI와 대화를 시작하세요</p>}
          {voiceStatus === "connecting" && <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.6)" }}>연결 중...</p>}
          {voiceStatus === "listening" && <p style={{ fontSize: "13px", fontWeight: 600, color: "#a78bfa" }}>듣고 있어요</p>}
          {voiceStatus === "speaking" && <p style={{ fontSize: "13px", fontWeight: 600, color: "#a78bfa" }}>AI가 말하고 있어요</p>}
          {voiceStatus === "processing" && <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)" }}>생각 중...</p>}
        </div>

        {showTranscript && messages.length > 0 && (
          <div className="hide-scrollbar" style={{
            width: "100%", maxHeight: "120px", overflowY: "auto",
            borderRadius: "16px", padding: "12px",
            background: "rgba(124,92,252,0.10)",
            border: "1px solid rgba(124,92,252,0.20)",
            display: "flex", flexDirection: "column", gap: "6px",
          }}>
            {messages.slice(-4).map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <span style={{
                  fontSize: "11px", padding: "5px 10px", borderRadius: "10px", maxWidth: "85%",
                  background: msg.role === "user" ? "rgba(124,92,252,0.5)" : "rgba(255,255,255,0.10)",
                  color: "rgba(255,255,255,0.9)",
                  border: `1px solid ${msg.role === "user" ? "rgba(124,92,252,0.4)" : "rgba(255,255,255,0.08)"}`,
                }}>
                  {msg.content}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 하단 컨트롤 */}
      <div style={{ padding: "0 20px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {started && messages.length > 0 && (
          <button onClick={() => setShowTranscript((v) => !v)} style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
            padding: "8px", borderRadius: "14px", border: "none", cursor: "pointer",
            background: showTranscript ? "rgba(124,92,252,0.20)" : "rgba(255,255,255,0.06)",
            color: showTranscript ? "#a78bfa" : "rgba(255,255,255,0.45)",
            fontSize: "12px", fontWeight: 500,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {showTranscript ? "대화 숨기기" : `대화 보기 (${messages.length})`}
          </button>
        )}

        <div style={{ display: "flex", gap: "10px" }}>
          {!started ? (
            <button onClick={startRecording} style={{
              flex: 1, padding: "9px", borderRadius: "16px", border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #7C5CFC, #a78bfa)",
              color: "white", fontSize: "15px", fontWeight: 700,
              boxShadow: "0 4px 24px rgba(124,92,252,0.5)",
            }}>대화 시작</button>
          ) : (
            <>
              <button onClick={handleStop} style={{
                flex: 1, padding: "8px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer",
                background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)",
                fontSize: "13px", fontWeight: 600,
              }}>취소</button>
              <button onClick={handleFinish} style={{
                flex: 1, padding: "8px", borderRadius: "14px", border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #7C5CFC, #a78bfa)",
                color: "white", fontSize: "13px", fontWeight: 700,
                boxShadow: "0 4px 20px rgba(124,92,252,0.45)",
              }}>완료 →</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
