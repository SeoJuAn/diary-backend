"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { diaryApi, contextApi, realtimeApi } from "@/lib/api";
import SummaryCard from "@/components/SummaryCard";

type SaveState = "idle" | "saving" | "saved" | "error";

export default function SummaryPage() {
  const router = useRouter();
  const {
    user, accessToken,
    messages, sessionId, sessionStartedAt,
    summary, setSummary, updateSummaryField,
    context, setContext,
    clearMessages, clearSession, clearSummary,
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [toastMsg, setToastMsg] = useState("");
  const [showDiaryModal, setShowDiaryModal] = useState(false);

  const today = new Date().toLocaleDateString("ko-KR", {
    year: "numeric", month: "long", day: "numeric", weekday: "long",
  });

  // ── 인증 체크 ──
  useEffect(() => {
    if (!user || !accessToken) router.push("/login");
  }, [user, accessToken, router]);

  // ── 대화 텍스트 조합 ──
  const conversationText = messages
    .map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`)
    .join("\n");

  // ── organize-diary + context/extract 자동 호출 ──
  const generateSummary = useCallback(async () => {
    if (messages.length === 0) return;
    if (summary) return; // 이미 있으면 재호출 안 함

    setLoading(true);
    try {
      const [diaryRes, ctxRes] = await Promise.all([
        diaryApi.organize({ text: conversationText }),
        contextApi.extract({ conversationText }),
      ]);

      setSummary(diaryRes.data.summary);
      setContext({
        keywords: ctxRes.data.context
          ? extractKeywords(ctxRes.data.context)
          : [],
        mainTopics: [],
        contextSummary: ctxRes.data.context || "",
      });
    } catch (err) {
      console.error("Summary generation failed:", err);
      showToast("요약 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [messages, summary, conversationText, setSummary, setContext]);

  useEffect(() => {
    generateSummary();
  }, [generateSummary]);

  // context/extract 결과에서 키워드 간단 추출
  function extractKeywords(contextText: string): string[] {
    const lines = contextText.split("\n").filter((l) => l.includes("키워드") || l.includes("주제") || l.includes("•") || l.includes("-"));
    const keywords: string[] = [];
    lines.forEach((line) => {
      const parts = line.replace(/[•\-*]/g, "").replace(/키워드|주제|:/g, "").trim().split(/[,，、]/);
      parts.forEach((p) => { if (p.trim()) keywords.push(p.trim()); });
    });
    return keywords.slice(0, 6);
  }

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  }

  // ── 저장 ──
  const handleSave = async () => {
    if (!summary || saveState === "saving") return;
    setSaveState("saving");

    const duration = sessionStartedAt
      ? Math.floor((Date.now() - sessionStartedAt) / 1000)
      : 0;

    try {
      await realtimeApi.endSession({
        sessionId: sessionId || `local_${Date.now()}`,
        duration,
        messageCount: messages.length,
        endedBy: "user",
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
          turn_index: m.turn_index,
        })),
        summary: {
          oneLiner: summary.oneLiner,
          dailyHighlights: summary.dailyHighlights,
          goalTracking: summary.goalTracking,
          gratitude: summary.gratitude,
          emotions: summary.emotions,
          fullDiary: summary.fullDiary,
        },
        context: {
          keywords: context?.keywords || [],
          mainTopics: context?.mainTopics || [],
          contextSummary: context?.contextSummary || "",
        },
      });

      setSaveState("saved");
      showToast("일기가 저장되었습니다!");
      clearMessages();
      clearSession();
    } catch (err) {
      console.error("Save failed:", err);
      setSaveState("error");
      showToast("저장 중 오류가 발생했습니다.");
    }
  };

  // ── 계속하기 ──
  const handleContinue = () => {
    router.push("/record");
  };

  return (
    <div
      className="flex flex-col min-h-dvh pb-32 hide-scrollbar"
      style={{ backgroundColor: "var(--color-bg)", overflowY: "auto" }}
    >
      {/* 상단 헤더 */}
      <div className="flex items-start justify-between px-5 pt-14 pb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-gray-900">{today}</h2>
            <button className="text-gray-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-400">날짜와 내용을 수정할 수 있어요</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 내용 보기 버튼 */}
          {summary?.fullDiary && (
            <button
              onClick={() => setShowDiaryModal(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors"
              style={{ borderColor: "var(--color-primary-light)", color: "var(--color-primary)", backgroundColor: "var(--color-primary-light)" }}
            >
              내용 보기
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
          {/* 삭제 버튼 */}
          <button
            onClick={() => { clearSummary(); clearMessages(); clearSession(); router.push("/record"); }}
            className="text-gray-400 hover:text-red-400 transition-colors p-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </button>
        </div>
      </div>

      {/* 로딩 상태 */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <motion.div
            className="w-12 h-12 rounded-full border-4 border-t-transparent"
            style={{ borderColor: "var(--color-primary-light)", borderTopColor: "var(--color-primary)" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p className="text-sm text-gray-500">대화 내용을 분석하고 있어요...</p>
        </div>
      )}

      {/* 대화 없음 */}
      {!loading && messages.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 px-6">
          <span className="text-5xl">💬</span>
          <p className="text-gray-500 text-center text-sm">대화 내용이 없습니다.<br />먼저 AI와 대화를 해보세요.</p>
          <button
            onClick={() => router.push("/record")}
            className="px-6 py-3 rounded-2xl text-white text-sm font-medium"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            대화 시작하기
          </button>
        </div>
      )}

      {/* 요약 카드들 */}
      {!loading && summary && (
        <div className="flex flex-col gap-4 px-5">
          {/* 한줄 요약 */}
          <SummaryCard
            icon="📌"
            title="한줄 요약"
            value={summary.oneLiner}
            onSave={(v) => updateSummaryField("oneLiner", v as string)}
          />

          {/* 일상 + 목표 (2열) */}
          <div className="grid grid-cols-2 gap-3">
            <SummaryCard
              icon="✨"
              title="일상"
              value={summary.dailyHighlights}
              onSave={(v) => updateSummaryField("dailyHighlights", v as string[])}
            />
            <SummaryCard
              icon="🎯"
              title="목표"
              value={summary.goalTracking}
              onSave={(v) => updateSummaryField("goalTracking", v as string[])}
            />
          </div>

          {/* 감사&행복 */}
          <SummaryCard
            icon="💗"
            title="감사&행복"
            value={summary.gratitude}
            onSave={(v) => updateSummaryField("gratitude", v as string[])}
          />

          {/* 감정 */}
          <SummaryCard
            icon="😊"
            title="감정"
            value={summary.emotions}
            onSave={(v) => updateSummaryField("emotions", v as string[])}
          />

          {/* 키워드 */}
          {context && context.keywords.length > 0 && (
            <SummaryCard
              icon="🔑"
              title="키워드"
              value={context.keywords}
            />
          )}

          <p className="text-center text-xs text-gray-400 py-2">추후 언제든 수정할 수 있어요</p>
        </div>
      )}

      {/* 하단 버튼 고정 */}
      {summary && (
        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] flex gap-3 px-5 pb-8 pt-4"
          style={{ backgroundColor: "var(--color-bg)" }}
        >
          <button
            onClick={handleContinue}
            className="flex-1 py-4 rounded-2xl text-gray-700 font-semibold text-sm transition-opacity border"
            style={{ borderColor: "var(--color-border)", backgroundColor: "white" }}
          >
            기록 계속하기
          </button>
          <button
            onClick={handleSave}
            disabled={saveState === "saving" || saveState === "saved"}
            className="flex-1 py-4 rounded-2xl text-white font-semibold text-sm transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {saveState === "saving"
              ? "저장 중..."
              : saveState === "saved"
              ? "저장됨 ✓"
              : "기록 저장하기"}
          </button>
        </div>
      )}

      {/* 토스트 */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-28 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-white text-sm font-medium shadow-lg z-50 whitespace-nowrap"
            style={{ backgroundColor: "#1A1A1A" }}
          >
            {toastMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* fullDiary 전체 보기 바텀시트 모달 */}
      <AnimatePresence>
        {showDiaryModal && (
          <>
            {/* 딤 배경 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDiaryModal(false)}
              className="fixed inset-0 z-40"
              style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
            />
            {/* 바텀시트 */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] z-50 rounded-t-3xl overflow-hidden"
              style={{ backgroundColor: "white", maxHeight: "80dvh" }}
            >
              {/* 핸들 바 */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-200" />
              </div>

              {/* 헤더 */}
              <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                <h3 className="font-semibold text-gray-900">오늘의 일기</h3>
                <button
                  onClick={() => setShowDiaryModal(false)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* 본문 */}
              <div className="px-5 py-4 overflow-y-auto hide-scrollbar" style={{ maxHeight: "calc(80dvh - 100px)" }}>
                <p className="text-sm text-gray-700 leading-7 whitespace-pre-wrap">
                  {summary?.fullDiary}
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
