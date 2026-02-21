"use client";

import { useState } from "react";
import TagChip from "./TagChip";

interface SummaryCardProps {
  icon: string;
  title: string;
  /** string: 단일 텍스트 (oneLiner, fullDiary) | string[]: 태그 목록 */
  value: string | string[];
  onSave?: (value: string | string[]) => void;
  className?: string;
}

export default function SummaryCard({
  icon,
  title,
  value,
  onSave,
  className = "",
}: SummaryCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string | string[]>(value);

  const isArray = Array.isArray(value);

  const handleSave = () => {
    onSave?.(draft);
    setEditing(false);
  };

  const handleRemoveTag = (idx: number) => {
    if (!Array.isArray(draft)) return;
    const next = draft.filter((_, i) => i !== idx);
    setDraft(next);
    onSave?.(next);
  };

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && e.currentTarget.value.trim()) {
      const newTag = e.currentTarget.value.trim();
      const next = Array.isArray(draft) ? [...draft, newTag] : [newTag];
      setDraft(next);
      onSave?.(next);
      e.currentTarget.value = "";
    }
  };

  return (
    <div
      className={className}
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: "18px",
        padding: "14px",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
          <span style={{ fontSize: "17px" }}>{icon}</span>
          <span style={{ fontWeight: 600, fontSize: "13px", color: "rgba(255,255,255,0.85)" }}>{title}</span>
        </div>
        {onSave && (
          <button
            onClick={() => (editing ? handleSave() : setEditing(true))}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "2px" }}
          >
            {editing ? (
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#a78bfa" }}>저장</span>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            )}
          </button>
        )}
      </div>

      {/* 내용 */}
      {editing ? (
        isArray ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {(draft as string[]).map((tag, i) => (
                <TagChip key={i} label={tag} onRemove={() => handleRemoveTag(i)} />
              ))}
            </div>
            <input
              type="text"
              placeholder="태그 입력 후 Enter"
              onKeyDown={handleAddTag}
              style={{
                width: "100%", fontSize: "13px", outline: "none", padding: "4px 0",
                borderBottom: "1px solid rgba(255,255,255,0.2)",
                background: "transparent", color: "rgba(255,255,255,0.8)",
              }}
            />
          </div>
        ) : (
          <textarea
            value={draft as string}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            style={{
              width: "100%", fontSize: "13px", outline: "none", resize: "none",
              padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.2)",
              background: "transparent", color: "rgba(255,255,255,0.8)", lineHeight: 1.6,
            }}
          />
        )
      ) : isArray ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {(value as string[]).length > 0 ? (
            (value as string[]).map((tag, i) => <TagChip key={i} label={tag} />)
          ) : (
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,0.3)" }}>내용 없음</span>
          )}
        </div>
      ) : (
        <p style={{ fontSize: "13px", color: "rgba(255,255,255,0.7)", lineHeight: 1.65, margin: 0 }}>
          {(value as string) || <span style={{ color: "rgba(255,255,255,0.3)" }}>내용 없음</span>}
        </p>
      )}
    </div>
  );
}
