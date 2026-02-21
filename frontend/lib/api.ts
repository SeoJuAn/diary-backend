import axios from "axios";

// 로컬: "" → next.config rewrite가 localhost:3001로 프록시
// Vercel: "" → 같은 도메인의 /api/* Serverless Functions로 직접 라우팅
const BASE_URL =
  typeof window !== "undefined"
    ? ""
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ── 요청 인터셉터: accessToken 자동 첨부 ──
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── 응답 인터셉터: 401 시 refresh token으로 자동 갱신 ──
let isRefreshing = false;
let failedQueue: { resolve: (v: unknown) => void; reject: (e: unknown) => void }[] = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config;

    // 401이고 아직 재시도 안 한 요청 + refresh 엔드포인트 자체는 제외
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes("/api/auth/refresh")
    ) {
      if (isRefreshing) {
        // 이미 갱신 중이면 큐에 대기
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken =
        typeof window !== "undefined"
          ? localStorage.getItem("refreshToken")
          : null;

      if (!refreshToken) {
        // refresh token 없음 → 로그아웃
        isRefreshing = false;
        processQueue(error, null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("user");
          window.location.href = "/login";
        }
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken });
        const { accessToken: newAccess, refreshToken: newRefresh, user } = res.data;

        // 새 토큰 저장
        localStorage.setItem("accessToken", newAccess);
        localStorage.setItem("refreshToken", newRefresh);
        localStorage.setItem("user", JSON.stringify(user));

        // axios 기본 헤더 업데이트
        api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
        originalRequest.headers.Authorization = `Bearer ${newAccess}`;

        processQueue(null, newAccess);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        if (typeof window !== "undefined") {
          localStorage.removeItem("accessToken");
          localStorage.removeItem("refreshToken");
          localStorage.removeItem("user");
          window.location.href = "/login";
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Auth ──
export const authApi = {
  register: (data: { username: string; password: string }) =>
    api.post("/api/auth/register", data),
  login: (data: { username: string; password: string }) =>
    api.post("/api/auth/login", data),
  refresh: (refreshToken: string) =>
    api.post("/api/auth/refresh", { refreshToken }),
};

// ── Realtime ──
export const realtimeApi = {
  getToken: (data: {
    sessionConfig: { model: string; voice?: string; instructions?: string };
    advancedConfig?: Record<string, unknown>;
  }) => api.post("/api/realtime/token", data),

  endSession: (data: {
    sessionId: string;
    duration: number;
    messageCount: number;
    endedBy: string;
    messages: { role: string; content: string; turn_index: number }[];
    summary: {
      oneLiner?: string;
      dailyHighlights?: string[];
      goalTracking?: string[];
      gratitude?: string[];
      emotions?: string[];
      fullDiary?: string;
    };
    context: {
      keywords?: string[];
      mainTopics?: string[];
      contextSummary?: string;
    };
  }) => api.post("/api/realtime/end", data),
};

// ── Prompts ──
export const promptsApi = {
  getCurrent: (endpoint: string) =>
    api.get(`/api/prompts/${endpoint}?action=current`),
};

// ── Advanced Presets ──
export const presetsApi = {
  getAll: (endpoint = "realtime") =>
    api.get(`/api/advanced-presets?endpoint=${endpoint}`),
};

// ── Organize Diary ──
export const diaryApi = {
  organize: (data: { text: string; llmProvider?: string }) =>
    api.post("/api/organize-diary", data),
};

// ── Context Extract ──
export const contextApi = {
  extract: (data: { conversationText: string; llmProvider?: string }) =>
    api.post("/api/context/extract", data),
};

// ── Conversation History ──
export const historyApi = {
  getHistory: (params: {
    date?: string;
    keyword?: string;
    limit?: number;
    offset?: number;
    sessionId?: string;
  }) => api.get("/api/conversations/history", { params }),
};

export default api;
