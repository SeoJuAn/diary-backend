"use client";

interface TagChipProps {
  label: string;
  onRemove?: () => void;
  variant?: "default" | "ghost";
}

export default function TagChip({
  label,
  onRemove,
  variant = "default",
}: TagChipProps) {
  if (variant === "ghost") {
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm text-gray-600 bg-gray-100">
        {label}
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-gray-400 hover:text-gray-600 ml-0.5"
          >
            ×
          </button>
        )}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium"
      style={{
        backgroundColor: "var(--color-primary-light)",
        color: "var(--color-primary)",
      }}
    >
      {label}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 hover:opacity-70"
          style={{ color: "var(--color-primary)" }}
        >
          ×
        </button>
      )}
    </span>
  );
}
