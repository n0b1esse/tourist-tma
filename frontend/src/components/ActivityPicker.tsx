"use client";

import { ACTIVITY_META, type ActivityType } from "@/types";

const ORDER: ActivityType[] = ["hiking", "walking", "bike", "run", "offroad"];

/** Выбор типа активности (ТЗ §1: 5 категорий). */
export default function ActivityPicker({
  value,
  onChange,
  compact,
}: {
  value: ActivityType;
  onChange: (a: ActivityType) => void;
  compact?: boolean;
}) {
  return (
    <div className={`flex gap-1.5 ${compact ? "" : "flex-wrap"}`}>
      {ORDER.map((a) => {
        const meta = ACTIVITY_META[a];
        const active = value === a;
        return (
          <button
            key={a}
            onClick={() => onChange(a)}
            title={meta.label}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-caption font-semibold transition ${
              active ? "bg-primary text-white" : "bg-[var(--tma-secondary-bg)] text-[var(--tma-hint)]"
            }`}
          >
            <span>{meta.emoji}</span>
            {!compact && <span>{meta.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
