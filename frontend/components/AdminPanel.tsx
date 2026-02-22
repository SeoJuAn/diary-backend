"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { promptsApi, presetsApi } from "@/lib/api";
import api from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────
type PanelTab = "logs" | "settings";
type SettingsTab = "prompt" | "params";
type LogLevel = "ALL" | "INFO" | "WARNING" | "ERROR" | "DEBUG";
type Endpoint = "realtime" | "organize-diary" | "context-extract" | "tts";

interface LogEntry {
  ts: string;
  level: string;
  emoji: string;
  name: string;
  msg: string;
}

interface PromptVersion {
  id: string; endpoint: string; version: string; name: string;
  prompt: string; is_current: boolean; is_default: boolean; created_at: string;
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

const LEVEL_FILTERS: LogLevel[] = ["ALL", "INFO", "WARNING", "ERROR", "DEBUG"];

function getLevelClass(level: string): string {
  switch (level) {
    case "INFO": return "log-info";
    case "WARNING": return "log-warning";
    case "ERROR": return "log-error";
    case "CRITICAL": return "log-critical";
    case "SYSTEM": return "log-system";
    case "DEBUG": return "log-debug";
    default: return "log-info";
  }
}

function getSseUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8000/api/logs/stream";
  // 로컬: Next.js가 SSE를 버퍼링하므로 FastAPI 직접 연결
  // 서버: Nginx가 /api/ 를 FastAPI로 프록시
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (isLocal) return `http://localhost:8000/api/logs/stream`;
  return `/api/logs/stream`;
}

// ── 로그 탭 ───────────────────────────────────────────────────────────────────
function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel>("ALL");
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let active = true;

    function connect() {
      if (!active) return;
      const url = getSseUrl();
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => setConnected(true);

      es.onmessage = (e) => {
        try {
          const entry: LogEntry = JSON.parse(e.data);
          setLogs((prev) => [...prev.slice(-499), entry]);
        } catch {}
      };

      es.onerror = () => {
        setConnected(false);
        es.close();
        // 2초 후 재연결
        if (active) setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      active = false;
      esRef.current?.close();
      setConnected(false);
    };
  }, []);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const clearLogs = async () => {
    await fetch(`/api/logs/clear`, { method: "DELETE" });
    setLogs([]);
  };

  const filtered = filter === "ALL"
    ? logs
    : logs.filter((l) => l.level === filter);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "0 0 4px" }}>
      {/* 툴바 */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px 8px", flexShrink: 0 }}>
        {/* 연결 상태 */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginRight: "4px" }}>
          <div style={{
            width: "7px", height: "7px", borderRadius: "50%",
            background: connected ? "#34d399" : "#f87171",
            boxShadow: connected ? "0 0 6px #34d399" : "none",
          }} />
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>
            {connected ? "LIVE" : "DISCONNECTED"}
          </span>
        </div>

        {/* 레벨 필터 */}
        <div style={{ display: "flex", gap: "4px", flex: 1, flexWrap: "wrap" }}>
          {LEVEL_FILTERS.map((lv) => (
            <button key={lv} onClick={() => setFilter(lv)} style={{
              padding: "3px 8px", borderRadius: "8px", border: "none", cursor: "pointer",
              fontSize: "10px", fontWeight: 600, fontFamily: "monospace",
              background: filter === lv ? "rgba(124,92,252,0.35)" : "rgba(255,255,255,0.06)",
              color: filter === lv ? "#a78bfa" : "rgba(255,255,255,0.4)",
              transition: "all 0.15s",
            }}>{lv}</button>
          ))}
        </div>

        {/* 자동 스크롤 토글 */}
        <button onClick={() => setAutoScroll(v => !v)} style={{
          padding: "3px 8px", borderRadius: "8px", border: "none", cursor: "pointer",
          fontSize: "10px", fontFamily: "monospace",
          background: autoScroll ? "rgba(52,211,153,0.15)" : "rgba(255,255,255,0.06)",
          color: autoScroll ? "#34d399" : "rgba(255,255,255,0.4)",
        }}>↓AUTO</button>

        {/* 클리어 */}
        <button onClick={clearLogs} style={{
          padding: "3px 8px", borderRadius: "8px", border: "none", cursor: "pointer",
          fontSize: "10px", fontFamily: "monospace",
          background: "rgba(248,113,113,0.12)", color: "rgba(248,113,113,0.7)",
        }}>CLR</button>

        {/* 카운트 */}
        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", fontFamily: "monospace", flexShrink: 0 }}>
          {filtered.length}
        </span>
      </div>

      {/* 구분선 */}
      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", flexShrink: 0 }} />

      {/* 로그 목록 */}
      <div className="hide-scrollbar" style={{
        flex: 1, overflowY: "auto", padding: "8px 16px",
        fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace",
        fontSize: "11.5px", lineHeight: "1.7",
      }}>
        {filtered.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.2)", textAlign: "center", marginTop: "40px", fontSize: "12px" }}>
            로그 대기 중...
          </div>
        ) : (
          filtered.map((log, i) => (
            <div key={i} className={getLevelClass(log.level)} style={{
              display: "flex", gap: "8px", padding: "1px 0",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
            }}>
              <span style={{ color: "rgba(255,255,255,0.25)", flexShrink: 0, fontSize: "10px", paddingTop: "1px" }}>
                {log.ts}
              </span>
              <span style={{ flexShrink: 0, fontSize: "10px", paddingTop: "1px" }}>{log.emoji}</span>
              <span style={{
                flexShrink: 0, fontSize: "10px", paddingTop: "1px",
                color: "rgba(167,139,250,0.6)", minWidth: "56px",
              }}>[{log.name}]</span>
              <span style={{ wordBreak: "break-all", flex: 1 }}>{log.msg}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── 설정 탭 ───────────────────────────────────────────────────────────────────
function SettingsTabContent() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("prompt");
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
      setPromptName(""); await loadPrompt(); showToast("✅ 저장하고 활성화되었습니다.");
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
      setNewPresetName(""); await loadPresets(); showToast("✅ 프리셋 저장 완료");
    } catch { showToast("저장 실패"); } finally { setPresetSaving(false); }
  };

  const handleDeletePreset = async (presetId: string) => {
    try { await api.delete("/api/advanced-presets", { data: { presetId } }); await loadPresets(); showToast("삭제되었습니다."); }
    catch (e: unknown) { showToast((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "삭제 실패"); }
  };

  // Glass 인풋 스타일
  const inputStyle: React.CSSProperties = {
    width: "100%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "10px", padding: "9px 12px", outline: "none",
    fontSize: "13px", color: "#f0eeff",
  };

  const cardStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "14px", padding: "14px",
  };

  const Slider = ({ label, value, min, max, step, unit, onChange }: {
    label: string; value: number; min: number; max: number; step: number; unit?: string; onChange: (v: number) => void;
  }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
        <span style={{ color: "rgba(255,255,255,0.6)", fontWeight: 500 }}>{label}</span>
        <span style={{ fontFamily: "monospace", color: "#a78bfa", fontWeight: 700 }}>{value}{unit || ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#7C5CFC", height: "4px", cursor: "pointer" }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "rgba(255,255,255,0.25)" }}>
        <span>{min}{unit || ""}</span><span>{max}{unit || ""}</span>
      </div>
    </div>
  );

  const btnStyle = (active?: boolean): React.CSSProperties => ({
    padding: "7px 12px", borderRadius: "10px", border: "none", cursor: "pointer",
    fontSize: "12px", fontWeight: 500, transition: "all 0.15s",
    background: active ? "rgba(124,92,252,0.3)" : "rgba(255,255,255,0.06)",
    color: active ? "#a78bfa" : "rgba(255,255,255,0.5)",
  });

  return (
    <div className="hide-scrollbar" style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: "12px", position: "relative" }}>
      {/* 내부 탭 */}
      <div style={{ display: "flex", gap: "4px", padding: "4px", borderRadius: "14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
        {(["prompt", "params"] as SettingsTab[]).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            flex: 1, padding: "8px", borderRadius: "10px", border: "none", cursor: "pointer",
            fontSize: "12px", fontWeight: 600, transition: "all 0.2s",
            background: activeTab === tab ? "rgba(124,92,252,0.30)" : "transparent",
            color: activeTab === tab ? "#a78bfa" : "rgba(255,255,255,0.4)",
            boxShadow: activeTab === tab ? "0 2px 8px rgba(0,0,0,0.2)" : "none",
          }}>{tab === "prompt" ? "📝 프롬프트" : "⚙️ AI 파라미터"}</button>
        ))}
      </div>

      {activeTab === "prompt" && (
        <>
          {/* 엔드포인트 선택 */}
          <div style={cardStyle}>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", marginBottom: "8px", fontWeight: 600 }}>대상 기능</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {ENDPOINTS.map(ep => (
                <button key={ep.value} onClick={() => setSelectedEndpoint(ep.value)} style={btnStyle(selectedEndpoint === ep.value)}>
                  {ep.label}
                </button>
              ))}
            </div>
          </div>

          {/* 프롬프트 에디터 */}
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                현재 프롬프트
                {currentPrompt && (
                  <span style={{ padding: "1px 6px", borderRadius: "6px", background: "rgba(124,92,252,0.25)", color: "#a78bfa", fontSize: "10px" }}>
                    {currentPrompt.name}
                  </span>
                )}
              </div>
              <button onClick={() => setShowVersions(v => !v)} style={{ ...btnStyle(), fontSize: "10px", padding: "3px 8px" }}>
                {showVersions ? "닫기" : "히스토리"}
              </button>
            </div>
            {promptLoading ? (
              <div style={{ height: "80px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "20px", height: "20px", borderRadius: "50%", border: "2px solid rgba(124,92,252,0.3)", borderTopColor: "#7C5CFC", animation: "spin 0.8s linear infinite" }} />
              </div>
            ) : (
              <textarea value={editingPrompt} onChange={(e) => setEditingPrompt(e.target.value)}
                rows={8} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6, fontFamily: "inherit" }}
                placeholder="프롬프트를 입력하세요..." />
            )}
          </div>

          {/* 버전 히스토리 */}
          {showVersions && versions.length > 0 && (
            <div style={cardStyle}>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 600, marginBottom: "8px" }}>버전 히스토리</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {versions.map(v => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: "10px", background: "rgba(255,255,255,0.04)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "2px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 500, color: "rgba(255,255,255,0.75)" }}>{v.version} · {v.name}</span>
                        {v.is_current && <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "5px", background: "rgba(124,92,252,0.3)", color: "#a78bfa" }}>활성</span>}
                        {v.is_default && <span style={{ fontSize: "9px", padding: "1px 5px", borderRadius: "5px", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>기본</span>}
                      </div>
                      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.prompt.slice(0, 50)}...</div>
                    </div>
                    <div style={{ display: "flex", gap: "4px", marginLeft: "8px", flexShrink: 0 }}>
                      {!v.is_current && (
                        <button onClick={() => handleActivateVersion(v.id)} style={{ ...btnStyle(true), fontSize: "10px", padding: "3px 7px" }}>활성화</button>
                      )}
                      {!v.is_default && !v.is_current && (
                        <button onClick={() => handleDeleteVersion(v.id)} style={{ padding: "3px 7px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "10px", background: "rgba(248,113,113,0.12)", color: "#fca5a5" }}>삭제</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 저장 */}
          <div style={cardStyle}>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 600, marginBottom: "8px" }}>새 버전으로 저장</div>
            <input type="text" value={promptName} onChange={(e) => setPromptName(e.target.value)}
              placeholder="버전 이름 (예: 더 친근하게)" style={{ ...inputStyle, marginBottom: "8px" }} />
            <button onClick={handleSavePrompt} disabled={promptSaving} style={{
              width: "100%", padding: "11px", borderRadius: "12px", border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #7C5CFC, #a78bfa)", color: "white",
              fontSize: "13px", fontWeight: 700, opacity: promptSaving ? 0.6 : 1,
              boxShadow: "0 4px 16px rgba(124,92,252,0.35)",
            }}>{promptSaving ? "저장 중..." : "저장하고 활성화"}</button>
          </div>
        </>
      )}

      {activeTab === "params" && (
        <>
          {/* 프리셋 목록 */}
          <div style={cardStyle}>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 600, marginBottom: "8px" }}>프리셋 선택</div>
            {presetsLoading ? (
              <div style={{ height: "60px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ width: "18px", height: "18px", borderRadius: "50%", border: "2px solid rgba(124,92,252,0.3)", borderTopColor: "#7C5CFC", animation: "spin 0.8s linear infinite" }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {presets.map(p => (
                  <div key={p.id} onClick={() => handleSelectPreset(p)} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "9px 12px", borderRadius: "10px", cursor: "pointer",
                    background: p.is_current ? "rgba(124,92,252,0.20)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${p.is_current ? "rgba(124,92,252,0.35)" : "transparent"}`,
                    transition: "all 0.15s",
                  }}>
                    <div>
                      <span style={{ fontSize: "13px", fontWeight: 500, color: p.is_current ? "#a78bfa" : "rgba(255,255,255,0.7)" }}>{p.preset_name}</span>
                      {p.user_id && <span style={{ fontSize: "10px", marginLeft: "6px", color: "#a78bfa" }}>내 프리셋</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      {p.is_current && <span style={{ fontSize: "10px", padding: "2px 7px", borderRadius: "8px", background: "#7C5CFC", color: "white" }}>활성</span>}
                      {p.user_id && !p.is_system && (
                        <button onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }} style={{ padding: "2px 7px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "10px", background: "rgba(248,113,113,0.12)", color: "#fca5a5" }}>삭제</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 슬라이더 */}
          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>파라미터 조정</div>
            <Slider label="Temperature" value={editingPreset.temperature ?? 0.8} min={0} max={1} step={0.05} onChange={v => setEditingPreset(p => ({ ...p, temperature: v }))} />
            <Slider label="Speed" value={editingPreset.speed ?? 1.0} min={0.5} max={2} step={0.1} onChange={v => setEditingPreset(p => ({ ...p, speed: v }))} />
            <Slider label="VAD Threshold" value={editingPreset.threshold ?? 0.5} min={0} max={1} step={0.05} onChange={v => setEditingPreset(p => ({ ...p, threshold: v }))} />
            <Slider label="Silence Duration" value={editingPreset.silence_duration_ms ?? 200} min={100} max={2000} step={100} unit="ms" onChange={v => setEditingPreset(p => ({ ...p, silence_duration_ms: v }))} />
          </div>

          {/* 프리셋 저장 */}
          <div style={cardStyle}>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)", fontWeight: 600, marginBottom: "8px" }}>커스텀 프리셋으로 저장</div>
            <input type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="프리셋 이름 (예: 내 설정)" style={{ ...inputStyle, marginBottom: "8px" }} />
            <button onClick={handleSavePreset} disabled={presetSaving} style={{
              width: "100%", padding: "11px", borderRadius: "12px", border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #7C5CFC, #a78bfa)", color: "white",
              fontSize: "13px", fontWeight: 700, opacity: presetSaving ? 0.6 : 1,
              boxShadow: "0 4px 16px rgba(124,92,252,0.35)",
            }}>{presetSaving ? "저장 중..." : "저장하고 활성화"}</button>
          </div>
        </>
      )}

      {/* 토스트 */}
      {toast && (
        <div style={{
          position: "absolute", bottom: "12px", left: "50%", transform: "translateX(-50%)",
          padding: "8px 16px", borderRadius: "12px", fontSize: "12px", fontWeight: 500,
          background: "rgba(30,16,64,0.95)", color: "#f0eeff",
          border: "1px solid rgba(124,92,252,0.3)", backdropFilter: "blur(12px)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)", whiteSpace: "nowrap", zIndex: 50,
        }}>{toast}</div>
      )}
    </div>
  );
}

// ── 메인 AdminPanel ───────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [activePanel, setActivePanel] = useState<PanelTab>("logs");

  return (
    <div className="admin-panel">
      {/* 패널 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px 0", flexShrink: 0,
      }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.02em" }}>
          DEV CONSOLE
        </div>
        {/* 탭 버튼 */}
        <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          {([
            { key: "logs" as PanelTab, label: "📋 로그" },
            { key: "settings" as PanelTab, label: "⚙️ 설정" },
          ]).map(tab => (
            <button key={tab.key} onClick={() => setActivePanel(tab.key)} style={{
              padding: "6px 16px", borderRadius: "9px", border: "none", cursor: "pointer",
              fontSize: "12px", fontWeight: 600, transition: "all 0.2s",
              background: activePanel === tab.key ? "rgba(124,92,252,0.35)" : "transparent",
              color: activePanel === tab.key ? "#a78bfa" : "rgba(255,255,255,0.35)",
              boxShadow: activePanel === tab.key ? "0 2px 8px rgba(0,0,0,0.25)" : "none",
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      {/* 구분선 */}
      <div style={{ height: "1px", background: "rgba(255,255,255,0.07)", margin: "12px 0 0", flexShrink: 0 }} />

      {/* 콘텐츠 */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activePanel === "logs" ? <LogsTab /> : <SettingsTabContent />}
      </div>

      {/* CSS keyframes */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  );
}
