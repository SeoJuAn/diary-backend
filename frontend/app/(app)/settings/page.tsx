"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAppStore } from "@/store/useAppStore";
import { promptsApi, presetsApi } from "@/lib/api";
import api from "@/lib/api";

type Endpoint = "realtime" | "organize-diary" | "context-extract" | "tts";

interface PromptVersion {
  id: string; endpoint: string; version: string; name: string;
  prompt: string; description?: string; is_current: boolean;
  is_default: boolean; created_at: string;
}

interface Preset {
  id: string; preset_name: string; temperature: number; speed: number;
  threshold: number; prefix_padding_ms: number; silence_duration_ms: number;
  idle_timeout_ms: number | null; max_output_tokens: string;
  noise_reduction: boolean | null; truncation: string;
  is_system: boolean; is_current: boolean; user_id: string | null;
}

const ENDPOINTS: { value: Endpoint; label: string }[] = [
  { value: "realtime", label: "실시간 대화" },
  { value: "organize-diary", label: "일기 요약" },
  { value: "context-extract", label: "컨텍스트 추출" },
  { value: "tts", label: "TTS" },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, accessToken } = useAppStore();
  const [activeTab, setActiveTab] = useState<"prompt" | "params">("prompt");

  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint>("realtime");
  const [currentPrompt, setCurrentPrompt] = useState<PromptVersion | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [editingPrompt, setEditingPrompt] = useState("");
  const [promptName, setPromptName] = useState("");
  const [showVersions, setShowVersions] = useState(false);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptSaving, setPromptSaving] = useState(false);

  const [presets, setPresets] = useState<Preset[]>([]);
  const [editingPreset, setEditingPreset] = useState<Partial<Preset>>({});
  const [newPresetName, setNewPresetName] = useState("");
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetSaving, setPresetSaving] = useState(false);

  const [toast, setToast] = useState("");
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    if (!user || !accessToken) router.push("/login");
  }, [user, accessToken, router]);

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
    } catch { showToast("프롬프트 로드 실패"); } finally { setPromptLoading(false); }
  }, [selectedEndpoint]);

  const loadPresets = useCallback(async () => {
    setPresetsLoading(true);
    try {
      const res = await presetsApi.getAll("realtime");
      const list: Preset[] = res.data.presets || [];
      setPresets(list);
      const active = list.find((p) => p.is_current) || list[0];
      if (active) setEditingPreset({ ...active });
    } catch { showToast("프리셋 로드 실패"); } finally { setPresetsLoading(false); }
  }, []);

  useEffect(() => { if (activeTab === "prompt") loadPrompt(); }, [activeTab, loadPrompt]);
  useEffect(() => { if (activeTab === "params") loadPresets(); }, [activeTab, loadPresets]);

  const handleSavePrompt = async () => {
    if (!editingPrompt.trim() || !promptName.trim()) { showToast("프롬프트 내용과 버전 이름을 입력해주세요."); return; }
    setPromptSaving(true);
    try {
      const cr = await api.post(`/api/prompts/${selectedEndpoint}`, { name: promptName, prompt: editingPrompt });
      await api.put(`/api/prompts/${selectedEndpoint}`, { versionId: cr.data.version.id });
      setPromptName(""); await loadPrompt(); showToast("저장하고 활성화되었습니다.");
    } catch { showToast("저장 실패"); } finally { setPromptSaving(false); }
  };

  const handleActivateVersion = async (versionId: string) => {
    try { await api.put(`/api/prompts/${selectedEndpoint}`, { versionId }); await loadPrompt(); showToast("활성화되었습니다."); }
    catch { showToast("활성화 실패"); }
  };

  const handleDeleteVersion = async (versionId: string) => {
    try { await api.delete(`/api/prompts/versions/${versionId}`); await loadPrompt(); showToast("삭제되었습니다."); }
    catch (e: unknown) { showToast((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "삭제 실패"); }
  };

  const handleSelectPreset = async (preset: Preset) => {
    setEditingPreset({ ...preset });
    try { await api.put("/api/advanced-presets", { endpoint: "realtime", presetId: preset.id }); await loadPresets(); showToast(`'${preset.preset_name}' 활성화`); }
    catch { showToast("활성화 실패"); }
  };

  const handleSavePreset = async () => {
    if (!newPresetName.trim()) { showToast("프리셋 이름을 입력해주세요."); return; }
    setPresetSaving(true);
    try {
      const cr = await api.post("/api/advanced-presets", {
        endpoint: "realtime", presetName: newPresetName,
        temperature: editingPreset.temperature, speed: editingPreset.speed,
        threshold: editingPreset.threshold, prefixPaddingMs: editingPreset.prefix_padding_ms,
        silenceDurationMs: editingPreset.silence_duration_ms,
      });
      await api.put("/api/advanced-presets", { endpoint: "realtime", presetId: cr.data.preset.id });
      setNewPresetName(""); await loadPresets(); showToast("저장하고 활성화되었습니다.");
    } catch { showToast("저장 실패"); } finally { setPresetSaving(false); }
  };

  const handleDeletePreset = async (presetId: string) => {
    try { await api.delete("/api/advanced-presets", { data: { presetId } }); await loadPresets(); showToast("삭제되었습니다."); }
    catch (e: unknown) { showToast((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "삭제 실패"); }
  };

  const Slider = ({ label, value, min, max, step, unit, onChange }: {
    label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void;
  }) => (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600 font-medium">{label}</span>
        <span className="font-mono" style={{ color: "var(--color-primary)" }}>{value}{unit || ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
        style={{ accentColor: "var(--color-primary)" }} />
      <div className="flex justify-between text-[10px] text-gray-300">
        <span>{min}{unit || ""}</span><span>{max}{unit || ""}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full relative" style={{ background: "var(--color-bg)" }}>
      {/* 헤더 */}
      <div className="px-5 pt-3 pb-3 shrink-0">
        <h2 className="text-base font-bold text-gray-900">설정</h2>
        <p className="text-xs text-gray-400 mt-0.5">{user?.nickname || user?.username}님의 AI 설정</p>
      </div>

      {/* 내부 탭 */}
      <div className="flex mx-5 mb-3 rounded-2xl p-1 shrink-0" style={{ background: "#EFEFEF" }}>
        {(["prompt", "params"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
            style={{
              background: activeTab === tab ? "white" : "transparent",
              color: activeTab === tab ? "var(--color-primary)" : "#999",
              boxShadow: activeTab === tab ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}>
            {tab === "prompt" ? "프롬프트" : "AI 파라미터"}
          </button>
        ))}
      </div>

      {/* 스크롤 콘텐츠 */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 hide-scrollbar">
        {activeTab === "prompt" && (
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-2xl p-3" style={{ border: "1px solid var(--color-border)" }}>
              <p className="text-xs text-gray-400 font-medium mb-2">대상 기능</p>
              <div className="grid grid-cols-2 gap-1.5">
                {ENDPOINTS.map((ep) => (
                  <button key={ep.value} onClick={() => setSelectedEndpoint(ep.value)}
                    className="py-2 px-2 rounded-xl text-xs font-medium transition-all"
                    style={{
                      background: selectedEndpoint === ep.value ? "var(--color-primary-light)" : "#F5F5F5",
                      color: selectedEndpoint === ep.value ? "var(--color-primary)" : "#555",
                    }}>
                    {ep.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-3" style={{ border: "1px solid var(--color-border)" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-400 font-medium">
                  현재 프롬프트
                  {currentPrompt && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px]"
                      style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                      {currentPrompt.name}
                    </span>
                  )}
                </p>
                <button onClick={() => setShowVersions((v) => !v)}
                  className="text-[10px] font-medium" style={{ color: "var(--color-primary)" }}>
                  {showVersions ? "닫기" : "히스토리"}
                </button>
              </div>
              {promptLoading ? (
                <div className="h-20 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: "var(--color-primary-light)", borderTopColor: "var(--color-primary)" }} />
                </div>
              ) : (
                <textarea value={editingPrompt} onChange={(e) => setEditingPrompt(e.target.value)}
                  rows={6} className="w-full text-xs text-gray-700 leading-relaxed resize-none outline-none rounded-xl p-2.5"
                  style={{ background: "#F8F8F8" }} placeholder="프롬프트를 입력하세요..." />
              )}
            </div>

            {showVersions && versions.length > 0 && (
              <div className="bg-white rounded-2xl p-3" style={{ border: "1px solid var(--color-border)" }}>
                <p className="text-xs text-gray-400 font-medium mb-2">버전 히스토리</p>
                <div className="flex flex-col gap-1.5">
                  {versions.map((v) => (
                    <div key={v.id} className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: "#F8F8F8" }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium text-gray-700">{v.version} · {v.name}</span>
                          {v.is_current && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>활성</span>}
                          {v.is_default && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500">기본</span>}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5 truncate">{v.prompt.slice(0, 35)}...</p>
                      </div>
                      <div className="flex gap-1 ml-2 shrink-0">
                        {!v.is_current && (
                          <button onClick={() => handleActivateVersion(v.id)}
                            className="text-[10px] px-2 py-1 rounded-lg font-medium"
                            style={{ background: "var(--color-primary-light)", color: "var(--color-primary)" }}>
                            활성화
                          </button>
                        )}
                        {!v.is_default && !v.is_current && (
                          <button onClick={() => handleDeleteVersion(v.id)}
                            className="text-[10px] px-2 py-1 rounded-lg font-medium bg-red-50 text-red-400">
                            삭제
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl p-3" style={{ border: "1px solid var(--color-border)" }}>
              <p className="text-xs text-gray-400 font-medium mb-2">새 버전으로 저장</p>
              <input type="text" value={promptName} onChange={(e) => setPromptName(e.target.value)}
                placeholder="버전 이름 (예: 더 친근하게)"
                className="w-full text-xs text-gray-700 rounded-xl px-3 py-2.5 outline-none mb-2"
                style={{ background: "#F8F8F8", border: "1px solid var(--color-border)" }} />
              <button onClick={handleSavePrompt} disabled={promptSaving}
                className="w-full py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #7C5CFC, #a78bfa)" }}>
                {promptSaving ? "저장 중..." : "저장하고 활성화"}
              </button>
            </div>
          </div>
        )}

        {activeTab === "params" && (
          <div className="flex flex-col gap-3">
            <div className="bg-white rounded-2xl p-3" style={{ border: "1px solid var(--color-border)" }}>
              <p className="text-xs text-gray-400 font-medium mb-2">프리셋 선택</p>
              {presetsLoading ? (
                <div className="h-16 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: "var(--color-primary-light)", borderTopColor: "var(--color-primary)" }} />
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {presets.map((p) => (
                    <div key={p.id}
                      className="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer"
                      style={{ background: p.is_current ? "var(--color-primary-light)" : "#F8F8F8" }}
                      onClick={() => handleSelectPreset(p)}>
                      <div>
                        <span className="text-xs font-medium" style={{ color: p.is_current ? "var(--color-primary)" : "#333" }}>
                          {p.preset_name}
                        </span>
                        {p.user_id && <span className="text-[10px] ml-1.5" style={{ color: "var(--color-primary)" }}>내 프리셋</span>}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.is_current && <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white" style={{ background: "var(--color-primary)" }}>활성</span>}
                        {p.user_id && !p.is_system && (
                          <button onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}
                            className="text-[10px] px-2 py-1 rounded-lg bg-red-50 text-red-400">삭제</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl p-3 flex flex-col gap-4" style={{ border: "1px solid var(--color-border)" }}>
              <p className="text-xs text-gray-400 font-medium">파라미터 조정</p>
              <Slider label="Temperature" value={editingPreset.temperature ?? 0.8} min={0} max={1} step={0.05} onChange={(v) => setEditingPreset((p) => ({ ...p, temperature: v }))} />
              <Slider label="Speed" value={editingPreset.speed ?? 1.0} min={0.5} max={2} step={0.1} onChange={(v) => setEditingPreset((p) => ({ ...p, speed: v }))} />
              <Slider label="VAD Threshold" value={editingPreset.threshold ?? 0.5} min={0} max={1} step={0.05} onChange={(v) => setEditingPreset((p) => ({ ...p, threshold: v }))} />
              <Slider label="Silence Duration" value={editingPreset.silence_duration_ms ?? 200} min={100} max={2000} step={100} unit="ms" onChange={(v) => setEditingPreset((p) => ({ ...p, silence_duration_ms: v }))} />
            </div>

            <div className="bg-white rounded-2xl p-3" style={{ border: "1px solid var(--color-border)" }}>
              <p className="text-xs text-gray-400 font-medium mb-2">커스텀 프리셋으로 저장</p>
              <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)}
                placeholder="프리셋 이름 (예: 내 설정)"
                className="w-full text-xs text-gray-700 rounded-xl px-3 py-2.5 outline-none mb-2"
                style={{ background: "#F8F8F8", border: "1px solid var(--color-border)" }} />
              <button onClick={handleSavePreset} disabled={presetSaving}
                className="w-full py-2.5 rounded-xl text-white text-xs font-bold disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #7C5CFC, #a78bfa)" }}>
                {presetSaving ? "저장 중..." : "저장하고 활성화"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-2xl text-white text-xs font-medium shadow-lg z-50 whitespace-nowrap"
          style={{ background: "#1A1A1A" }}>
          {toast}
        </div>
      )}
    </div>
  );
}
