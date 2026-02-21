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
      className={`bg-white rounded-2xl p-4 shadow-sm ${className}`}
      style={{ border: "1px solid var(--color-border)" }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="font-semibold text-sm text-gray-800">{title}</span>
        </div>
        {onSave && (
          <button
            onClick={() => (editing ? handleSave() : setEditing(true))}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            {editing ? (
              <span className="text-xs font-medium" style={{ color: "var(--color-primary)" }}>
                저장
              </span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {(draft as string[]).map((tag, i) => (
                <TagChip key={i} label={tag} onRemove={() => handleRemoveTag(i)} />
              ))}
            </div>
            <input
              type="text"
              placeholder="태그 입력 후 Enter"
              onKeyDown={handleAddTag}
              className="w-full text-sm border-b border-gray-200 outline-none py-1 text-gray-700"
              style={{ background: "transparent" }}
            />
          </div>
        ) : (
          <textarea
            value={draft as string}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full text-sm text-gray-700 outline-none resize-none border-b border-gray-200 py-1"
            style={{ background: "transparent" }}
          />
        )
      ) : isArray ? (
        <div className="flex flex-wrap gap-2">
          {(value as string[]).length > 0 ? (
            (value as string[]).map((tag, i) => <TagChip key={i} label={tag} />)
          ) : (
            <span className="text-sm text-gray-400">내용 없음</span>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-700 leading-relaxed">
          {(value as string) || <span className="text-gray-400">내용 없음</span>}
        </p>
      )}
    </div>
  );
}
