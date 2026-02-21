"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { promptsApi, presetsApi } from "@/lib/api";
import api from "@/lib/api";

// ── Types ──
type Endpoint = "realtime" | "organize-diary" | "context-extract" | "tts";

interface PromptVersion {
  id: string;
  endpoint: string;
  version: string;
  name: string;
  prompt: string;
  description?: string;
  is_current: boolean;
  is_default: boolean;
  created_at: string;
}

interface Preset {
  id: string;
  preset_name: string;
  temperature: number;
  speed: number;
  threshold: number;
  prefix_padding_ms: number;
  silence_duration_ms: number;
  idle_timeout_ms: number | null;
  max_output_tokens: string;
  noise_reduction: boolean | null;
  truncation: string;
  is_system: boolean;
  is_current: boolean;
  user_id: string | null;
}

const ENDPOINTS: { value: Endpoint; label: string }[] = [
  { value: "realtime", label: "실시간 대화" },
  { value: "organize-diary", label: "일기 요약" },
  { value: "context-extract", label: "컨텍스트 추출" },
  { value: "tts", label: "TTS" },
];

export default function AdminPage() {
  const router = useRouter();
  const { user, accessToken } = useAppStore();
  const [activeTab, setActiveTab] = useState<"prompt" | "params">("prompt");

  // ── 프롬프트 상태 ──
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint>("realtime");
  const [currentPrompt, setCurrentPrompt] = useState<PromptVersion | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [editingPrompt, setEditingPrompt] = useState("");
  const [promptName, setPromptName] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);

  // ── 프리셋 상태 ──
  const [presets, setPresets] = useState<Preset[]>([]);
  const [editingPreset, setEditingPreset] = useState<Partial<Preset>>({});
  const [newPresetName, setNewPresetName] = useState("");
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetSaving, setPresetSaving] = useState(false);

  // ── 토스트 ──
  const [toast, setToast] = useState("");
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // ── 인증 체크 ──
  useEffect(() => {
    if (!user || !accessToken) router.push("/login");
  }, [user, accessToken, router]);

  // ── 프롬프트 로드 ──
  const loadPrompt = useCallback(async () => {
    setPromptLoading(true);
    try {
      const [currentRes, versionsRes] = await Promise.all([
        promptsApi.getCurrent(selectedEndpoint),
        api.get(`/api/prompts/${selectedEndpoint}?action=versions`),
      ]);
      const p = currentRes.data.prompt;
      setCurrentPrompt(p);
      setEditingPrompt(p?.prompt || "");
      setVersions(versionsRes.data.versions || []);
    } catch {
      showToast("프롬프트 로드 실패");
    } finally {
      setPromptLoading(false);
    }
  }, [selectedEndpoint]);

  useEffect(() => {
    if (activeTab === "prompt") loadPrompt();
  }, [activeTab, loadPrompt]);

  // ── 프리셋 로드 ──
  const loadPresets = useCallback(async () => {
    setPresetsLoading(true);
    try {
      const res = await presetsApi.getAll("realtime");
      const list: Preset[] = res.data.presets || [];
      setPresets(list);
      const active = list.find((p) => p.is_current) || list[0];
      if (active) setEditingPreset({ ...active });
    } catch {
      showToast("프리셋 로드 실패");
    } finally {
      setPresetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === "params") loadPresets();
  }, [activeTab, loadPresets]);

  // ── 프롬프트 저장 ──
  const handleSavePrompt = async () => {
    if (!editingPrompt.trim() || !promptName.trim()) {
      showToast("프롬프트 내용과 버전 이름을 입력해주세요.");
      return;
    }
    setPromptSaving(true);
    try {
      const createRes = await api.post(`/api/prompts/${selectedEndpoint}`, {
        name: promptName,
        prompt: editingPrompt,
      });
      const newVersionId = createRes.data.version.id;
      await api.put(`/api/prompts/${selectedEndpoint}`, { versionId: newVersionId });
      setPromptName("");
      await loadPrompt();
      showToast("프롬프트가 저장되고 활성화되었습니다.");
    } catch {
      showToast("프롬프트 저장 실패");
    } finally {
      setPromptSaving(false);
    }
  };

  // ── 버전 활성화 ──
  const handleActivateVersion = async (versionId: string) => {
    try {
      await api.put(`/api/prompts/${selectedEndpoint}`, { versionId });
      await loadPrompt();
      showToast("프롬프트가 활성화되었습니다.");
    } catch {
      showToast("활성화 실패");
    }
  };

  // ── 버전 삭제 ──
  const handleDeleteVersion = async (versionId: string) => {
    try {
      await api.delete(`/api/prompts/versions/${versionId}`);
      await loadPrompt();
      showToast("버전이 삭제되었습니다.");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast(msg || "삭제 실패");
    }
  };

  // ── 프리셋 선택 ──
  const handleSelectPreset = async (preset: Preset) => {
    setEditingPreset({ ...preset });
    try {
      await api.put("/api/advanced-presets", { endpoint: "realtime", presetId: preset.id });
      await loadPresets();
      showToast(`'${preset.preset_name}' 프리셋이 활성화되었습니다.`);
    } catch {
      showToast("프리셋 활성화 실패");
    }
  };

  // ── 커스텀 프리셋 저장 ──
  const handleSavePreset = async () => {
    if (!newPresetName.trim()) {
      showToast("프리셋 이름을 입력해주세요.");
      return;
    }
    setPresetSaving(true);
    try {
      const createRes = await api.post("/api/advanced-presets", {
        endpoint: "realtime",
        presetName: newPresetName,
        temperature: editingPreset.temperature,
        speed: editingPreset.speed,
        threshold: editingPreset.threshold,
        prefixPaddingMs: editingPreset.prefix_padding_ms,
        silenceDurationMs: editingPreset.silence_duration_ms,
        idleTimeoutMs: editingPreset.idle_timeout_ms,
        maxOutputTokens: editingPreset.max_output_tokens,
        noiseReduction: editingPreset.noise_reduction,
        truncation: editingPreset.truncation,
      });
      const newId = createRes.data.preset.id;
      await api.put("/api/advanced-presets", { endpoint: "realtime", presetId: newId });
      setNewPresetName("");
      await loadPresets();
      showToast("프리셋이 저장되고 활성화되었습니다.");
    } catch {
      showToast("프리셋 저장 실패");
    } finally {
      setPresetSaving(false);
    }
  };

  // ── 프리셋 삭제 ──
  const handleDeletePreset = async (presetId: string) => {
    try {
      await api.delete("/api/advanced-presets", { data: { presetId } });
      await loadPresets();
      showToast("프리셋이 삭제되었습니다.");
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showToast(msg || "삭제 실패");
    }
  };

  const Slider = ({
    label, value, min, max, step, unit, onChange,
  }: {
    label: string; value: number; min: number; max: number;
    step: number; unit?: string; onChange: (v: number) => void;
  }) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="font-mono" style={{ color: "var(--color-primary)" }}>
          {value}{unit || ""}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: "var(--color-primary)" }}
      />
      <div className="flex justify-between text-xs text-gray-300">
        <span>{min}{unit || ""}</span><span>{max}{unit || ""}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-dvh" style={{ backgroundColor: "var(--color-bg)" }}>
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 pt-14 pb-4">
        <button onClick={() => router.back()} className="text-gray-400 p-1">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M5 12l7-7M5 12l7 7" />
          </svg>
        </button>
        <h1 className="text-base font-bold text-gray-900">⚙️ 설정</h1>
        <div className="w-8" />
      </div>

      {/* 탭 */}
      <div className="flex mx-5 mb-4 rounded-2xl p-1" style={{ backgroundColor: "#EFEFEF" }}>
        {(["prompt", "params"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              backgroundColor: activeTab === tab ? "white" : "transparent",
              color: activeTab === tab ? "var(--color-primary)" : "#888",
              boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}
          >
            {tab === "prompt" ? "프롬프트" : "AI 파라미터"}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-32 hide-scrollbar">
        {/* ── 프롬프트 탭 ── */}
        {activeTab === "prompt" && (
          <div className="flex flex-col gap-4">
            {/* endpoint 선택 */}
            <div className="bg-white rounded-2xl p-4" style={{ border: "1px solid var(--color-border)" }}>
              <p className="text-xs text-gray-500 mb-2 font-medium">대상 기능</p>
              <div className="grid grid-cols-2 gap-2">
                {ENDPOINTS.map((ep) => (
                  <button
                    key={ep.value}
                    onClick={() => setSelectedEndpoint(ep.value)}
                    className="py-2 px-3 rounded-xl text-sm font-medium transition-all"
                    style={{
                      backgroundColor: selectedEndpoint === ep.value ? "var(--color-primary-light)" : "#F5F5F5",
                      color: selectedEndpoint === ep.value ? "var(--color-primary)" : "#555",
                    }}
                  >
                    {ep.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 현재 프롬프트 */}
            <div className="bg-white rounded-2xl p-4" style={{ border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 font-medium">
                  현재 프롬프트
                  {currentPrompt && (
                    <span className="ml-2 text-xs px-1.5 py-0.5 rounded-md" style={{ backgroundColor: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                      {currentPrompt.version} · {currentPrompt.name}
                    </span>
                  )}
                </p>
                <button
                  onClick={() => setShowVersions((v) => !v)}
                  className="text-xs font-medium"
                  style={{ color: "var(--color-primary)" }}
                >
                  {showVersions ? "닫기" : "버전 히스토리"}
                </button>
              </div>

              {promptLoading ? (
                <div className="h-32 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-primary-light)", borderTopColor: "var(--color-primary)" }} />
                </div>
              ) : (
                <textarea
                  value={editingPrompt}
                  onChange={(e) => setEditingPrompt(e.target.value)}
                  rows={8}
                  className="w-full text-sm text-gray-700 leading-relaxed resize-none outline-none bg-gray-50 rounded-xl p-3"
                  placeholder="프롬프트를 입력하세요..."
                />
              )}
            </div>

            {/* 버전 히스토리 */}
            {showVersions && versions.length > 0 && (
              <div className="bg-white rounded-2xl p-4" style={{ border: "1px solid var(--color-border)" }}>
                <p className="text-xs text-gray-500 font-medium mb-3">버전 히스토리</p>
                <div className="flex flex-col gap-2">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between p-3 rounded-xl" style={{ backgroundColor: "#F8F8F8" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium text-gray-700">{v.version} · {v.name}</span>
                          {v.is_current && (
                            <span className="text-xs px-1.5 py-0.5 rounded-md" style={{ backgroundColor: "var(--color-primary-light)", color: "var(--color-primary)" }}>활성</span>
                          )}
                          {v.is_default && (
                            <span className="text-xs px-1.5 py-0.5 rounded-md bg-gray-200 text-gray-500">기본</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{v.prompt.slice(0, 40)}...</p>
                      </div>
                      <div className="flex gap-1.5 ml-2">
                        {!v.is_current && (
                          <button
                            onClick={() => handleActivateVersion(v.id)}
                            className="text-xs px-2 py-1 rounded-lg font-medium"
                            style={{ backgroundColor: "var(--color-primary-light)", color: "var(--color-primary)" }}
                          >
                            활성화
                          </button>
                        )}
                        {!v.is_default && !v.is_current && (
                          <button
                            onClick={() => handleDeleteVersion(v.id)}
                            className="text-xs px-2 py-1 rounded-lg font-medium bg-red-50 text-red-400"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 새 버전으로 저장 */}
            <div className="bg-white rounded-2xl p-4" style={{ border: "1px solid var(--color-border)" }}>
              <p className="text-xs text-gray-500 font-medium mb-3">새 버전으로 저장</p>
              <input
                type="text"
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
                placeholder="버전 이름 (예: 더 친근하게)"
                className="w-full text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 outline-none mb-3"
                style={{ border: "1px solid var(--color-border)" }}
              />
              <button
                onClick={handleSavePrompt}
                disabled={promptSaving}
                className="w-full py-3 rounded-2xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {promptSaving ? "저장 중..." : "저장하고 활성화"}
              </button>
            </div>
          </div>
        )}

        {/* ── AI 파라미터 탭 ── */}
        {activeTab === "params" && (
          <div className="flex flex-col gap-4">
            {/* 프리셋 선택 */}
            <div className="bg-white rounded-2xl p-4" style={{ border: "1px solid var(--color-border)" }}>
              <p className="text-xs text-gray-500 font-medium mb-3">프리셋 선택</p>
              {presetsLoading ? (
                <div className="h-20 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-primary-light)", borderTopColor: "var(--color-primary)" }} />
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {presets.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all"
                      style={{
                        backgroundColor: p.is_current ? "var(--color-primary-light)" : "#F8F8F8",
                        border: p.is_current ? "1px solid var(--color-primary-dim)" : "1px solid transparent",
                      }}
                      onClick={() => handleSelectPreset(p)}
                    >
                      <div>
                        <span className="text-sm font-medium" style={{ color: p.is_current ? "var(--color-primary)" : "#333" }}>
                          {p.preset_name}
                        </span>
                        <div className="flex gap-1.5 mt-0.5">
                          {p.is_system && <span className="text-xs text-gray-400">시스템</span>}
                          {!p.user_id && !p.is_system && <span className="text-xs text-gray-400">공유</span>}
                          {p.user_id && <span className="text-xs" style={{ color: "var(--color-primary)" }}>내 프리셋</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {p.is_current && (
                          <span className="text-xs px-2 py-0.5 rounded-md" style={{ backgroundColor: "var(--color-primary)", color: "white" }}>활성</span>
                        )}
                        {p.user_id && !p.is_system && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}
                            className="text-xs text-red-400 px-2 py-1 rounded-lg bg-red-50"
                          >
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 파라미터 슬라이더 */}
            <div className="bg-white rounded-2xl p-4" style={{ border: "1px solid var(--color-border)" }}>
              <p className="text-xs text-gray-500 font-medium mb-4">파라미터 조정</p>
              <div className="flex flex-col gap-5">
                <Slider
                  label="Temperature (창의성)"
                  value={editingPreset.temperature ?? 0.8}
                  min={0} max={1} step={0.05}
                  onChange={(v) => setEditingPreset((p) => ({ ...p, temperature: v }))}
                />
                <Slider
                  label="Speed (말하기 속도)"
                  value={editingPreset.speed ?? 1.0}
                  min={0.5} max={2.0} step={0.1}
                  onChange={(v) => setEditingPreset((p) => ({ ...p, speed: v }))}
                />
                <Slider
                  label="VAD Threshold (음성 감지 민감도)"
                  value={editingPreset.threshold ?? 0.5}
                  min={0} max={1} step={0.05}
                  onChange={(v) => setEditingPreset((p) => ({ ...p, threshold: v }))}
                />
                <Slider
                  label="Prefix Padding"
                  value={editingPreset.prefix_padding_ms ?? 300}
                  min={0} max={1000} step={50}
                  unit="ms"
                  onChange={(v) => setEditingPreset((p) => ({ ...p, prefix_padding_ms: v }))}
                />
                <Slider
                  label="Silence Duration (침묵 감지)"
                  value={editingPreset.silence_duration_ms ?? 200}
                  min={100} max={2000} step={100}
                  unit="ms"
                  onChange={(v) => setEditingPreset((p) => ({ ...p, silence_duration_ms: v }))}
                />
              </div>
            </div>

            {/* 커스텀 프리셋으로 저장 */}
            <div className="bg-white rounded-2xl p-4" style={{ border: "1px solid var(--color-border)" }}>
              <p className="text-xs text-gray-500 font-medium mb-3">커스텀 프리셋으로 저장</p>
              <input
                type="text"
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="프리셋 이름 (예: 내 설정)"
                className="w-full text-sm text-gray-700 bg-gray-50 rounded-xl px-3 py-2.5 outline-none mb-3"
                style={{ border: "1px solid var(--color-border)" }}
              />
              <button
                onClick={handleSavePreset}
                disabled={presetSaving}
                className="w-full py-3 rounded-2xl text-white text-sm font-semibold disabled:opacity-60"
                style={{ backgroundColor: "var(--color-primary)" }}
              >
                {presetSaving ? "저장 중..." : "저장하고 활성화"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div
          className="fixed bottom-10 left-1/2 -translate-x-1/2 px-5 py-3 rounded-2xl text-white text-sm font-medium shadow-lg z-50 whitespace-nowrap"
          style={{ backgroundColor: "#1A1A1A" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
