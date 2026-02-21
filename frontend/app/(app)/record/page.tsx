"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { realtimeApi } from "@/lib/api";
import { realtimeClient } from "@/lib/webrtc";
import VoiceOrb from "@/components/VoiceOrb";

export default function RecordPage() {
  const router = useRouter();
  const {
    user, accessToken,
    voiceStatus, setVoiceStatus,
    sessionId, setSessionId,
    sessionStartedAt, startSession, clearSession,
    messages, addMessage, clearMessages,
    clearSummary,
  } = useAppStore();

  const [showTranscript, setShowTranscript] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  // ── 인증 체크 ──
  useEffect(() => {
    if (!user || !accessToken) {
      router.push("/login");
    }
  }, [user, accessToken, router]);

  // ── 세션 타이머 ──
  useEffect(() => {
    if (voiceStatus === "listening" || voiceStatus === "speaking" || voiceStatus === "processing") {
      if (!timerRef.current) {
        timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
      }
    } else if (voiceStatus === "ended" || voiceStatus === "idle") {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [voiceStatus]);

  // ── transcript 자동 스크롤 ──
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── WebRTC 연결 ──
  const startRecording = useCallback(async () => {
    if (!accessToken) return;
    clearMessages();
    clearSummary();
    startSession();

    try {
      const tokenRes = await realtimeApi.getToken({
        sessionConfig: { model: "gpt-4o-realtime-preview-2024-12-17" },
      });
      const { token, sessionId: sid } = tokenRes.data;
      setSessionId(sid);

      await realtimeClient.connect(
        token,
        "gpt-4o-realtime-preview-2024-12-17",
        {
          onStatusChange: (s) => setVoiceStatus(s),
          onUserTranscript: (text) => {
            if (text.trim()) addMessage({ role: "user", content: text });
          },
          onAssistantTranscript: (text, isDone) => {
            if (isDone && text.trim()) {
              addMessage({ role: "assistant", content: text });
            }
          },
          onError: (err) => {
            console.error("WebRTC Error:", err);
            setVoiceStatus("ended");
          },
          onToolCall: async () => ({}),
        },
        accessToken
      );
    } catch (err) {
      console.error("Failed to start session:", err);
      setVoiceStatus("ended");
    }
  }, [accessToken, clearMessages, clearSummary, startSession, setSessionId, setVoiceStatus, addMessage]);

  // ── 페이지 진입 시 자동 시작 ──
  useEffect(() => {
    if (user && accessToken && voiceStatus === "idle") {
      startRecording();
    }
    return () => {
      realtimeClient.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 일시정지 ──
  const handlePause = () => {
    setIsPaused((p) => !p);
    // 실제로 마이크 뮤트/언뮤트 처리 가능 (확장 포인트)
  };

  // ── 완료 → summary 화면 이동 ──
  const handleFinish = () => {
    realtimeClient.disconnect();
    clearSession();
    router.push("/summary");
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div
      className="flex flex-col h-full"
      style={{ backgroundColor: "var(--color-bg)" }}
    >
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between px-5 pt-3 pb-4">
        <button
          onClick={() => { realtimeClient.disconnect(); router.back(); }}
          className="text-gray-400 p-1"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M5 12l7-7M5 12l7 7" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">{today}</span>
        </div>
        {/* 경과 시간 + 설정 버튼 */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 font-mono">{formatTime(elapsedSec)}</span>
          <button onClick={() => router.push("/settings")} className="text-gray-400 p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </div>

      {/* VoiceOrb 중앙 */}
      <VoiceOrb status={voiceStatus} />

      {/* 실시간 transcript 패널 */}
      <AnimatePresence>
        {showTranscript && (
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="absolute bottom-28 left-0 right-0 mx-4 rounded-3xl overflow-hidden shadow-xl"
            style={{ maxHeight: "40vh", backgroundColor: "white" }}
          >
            <div className="p-4 overflow-y-auto hide-scrollbar" style={{ maxHeight: "40vh" }}>
              <p className="text-xs text-gray-400 font-medium mb-3">대화 내용</p>
              {messages.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">아직 대화 내용이 없습니다</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <span
                        className={`text-sm px-3 py-2 rounded-2xl max-w-[85%] ${
                          msg.role === "user"
                            ? "text-white"
                            : "text-gray-700 bg-gray-100"
                        }`}
                        style={
                          msg.role === "user"
                            ? { backgroundColor: "var(--color-primary)" }
                            : {}
                        }
                      >
                        {msg.content}
                      </span>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 하단 컨트롤 버튼 4개 */}
      <div className="flex items-center justify-between px-10 pb-10 pt-4">
        {/* 대화 보기 */}
        <ControlButton
          active={showTranscript}
          onClick={() => setShowTranscript((v) => !v)}
          label="대화"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </ControlButton>

        {/* 연속 대화 토글 (현재 상태 표시용) */}
        <ControlButton
          onClick={() => {}}
          label="연속"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 2l4 4-4 4" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <path d="M7 22l-4-4 4-4" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
        </ControlButton>

        {/* 일시정지 */}
        <ControlButton
          active={isPaused}
          onClick={handlePause}
          label={isPaused ? "재개" : "정지"}
        >
          {isPaused ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
          )}
        </ControlButton>

        {/* 완료 */}
        <ControlButton
          onClick={handleFinish}
          label="완료"
          variant="primary"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </ControlButton>
      </div>
    </div>
  );
}

// ── 하단 버튼 컴포넌트 ──
function ControlButton({
  children,
  onClick,
  active,
  label,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
  variant?: "default" | "primary";
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1.5"
    >
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-95"
        style={{
          backgroundColor:
            variant === "primary"
              ? "var(--color-primary)"
              : active
              ? "var(--color-primary-light)"
              : "#F0F0F0",
          color:
            variant === "primary"
              ? "white"
              : active
              ? "var(--color-primary)"
              : "#555",
        }}
      >
        {children}
      </div>
      <span className="text-xs text-gray-500">{label}</span>
    </button>
  );
}
