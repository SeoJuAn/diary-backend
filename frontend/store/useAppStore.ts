"use client";

import { create } from "zustand";

export type VoiceStatus = "idle" | "connecting" | "listening" | "speaking" | "processing" | "ended";

export interface Message {
  role: "user" | "assistant";
  content: string;
  turn_index: number;
  timestamp: number;
}

export interface User {
  id: string;
  email?: string;
  username?: string;
  nickname?: string;
}

export interface Summary {
  oneLiner: string;
  dailyHighlights: string[];
  goalTracking: string[];
  gratitude: string[];
  emotions: string[];
  fullDiary: string;
}

export interface Context {
  keywords: string[];
  mainTopics: string[];
  contextSummary: string;
}

interface AppState {
  // ── Auth ──
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  initAuth: () => void;

  // ── Session ──
  sessionId: string | null;          // OpenAI session ID
  sessionStartedAt: number | null;
  voiceStatus: VoiceStatus;
  setSessionId: (id: string) => void;
  setVoiceStatus: (status: VoiceStatus) => void;
  startSession: () => void;
  clearSession: () => void;

  // ── Transcript (실시간 대화 내용) ──
  messages: Message[];
  addMessage: (msg: Omit<Message, "turn_index" | "timestamp">) => void;
  clearMessages: () => void;

  // ── Summary (대화 정리 결과) ──
  summary: Summary | null;
  context: Context | null;
  setSummary: (s: Summary) => void;
  setContext: (c: Context) => void;
  updateSummaryField: <K extends keyof Summary>(key: K, value: Summary[K]) => void;
  clearSummary: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // ── Auth ──
  user: null,
  accessToken: null,

  setAuth: (user, accessToken, refreshToken) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("user", JSON.stringify(user));
    }
    set({ user, accessToken });
  },

  clearAuth: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
    }
    set({ user: null, accessToken: null });
  },

  initAuth: () => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("accessToken");
      const userStr = localStorage.getItem("user");
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr);
          set({ user, accessToken: token });
        } catch {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("user");
        }
      }
    }
  },

  // ── Session ──
  sessionId: null,
  sessionStartedAt: null,
  voiceStatus: "idle",

  setSessionId: (id) => set({ sessionId: id }),
  setVoiceStatus: (status) => set({ voiceStatus: status }),

  startSession: () =>
    set({ sessionStartedAt: Date.now(), voiceStatus: "connecting" }),

  clearSession: () =>
    set({ sessionId: null, sessionStartedAt: null, voiceStatus: "idle" }),

  // ── Transcript ──
  messages: [],

  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...msg,
          turn_index: state.messages.length,
          timestamp: Date.now(),
        },
      ],
    })),

  clearMessages: () => set({ messages: [] }),

  // ── Summary ──
  summary: null,
  context: null,

  setSummary: (s) => set({ summary: s }),
  setContext: (c) => set({ context: c }),

  updateSummaryField: (key, value) =>
    set((state) => ({
      summary: state.summary ? { ...state.summary, [key]: value } : null,
    })),

  clearSummary: () => set({ summary: null, context: null }),
}));
