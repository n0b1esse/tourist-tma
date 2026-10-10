"use client";

import type { AppMode, UserRole } from "@/types";

/** Переключатель Production / Tester (§3). Tester доступен tester/admin. */
export default function ModeSwitcher({
  mode,
  role,
  onChange,
}: {
  mode: AppMode;
  role: UserRole | null;
  onChange: (m: AppMode) => void;
}) {
  const canTest = role === "tester" || role === "admin";
  return (
    <div className="flex rounded-full bg-[var(--tma-secondary-bg)] p-1 text-body">
      <button
        className={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${
          mode === "production" ? "bg-success text-white" : "text-[var(--tma-hint)]"
        }`}
        onClick={() => onChange("production")}
      >
        Production
      </button>
      <button
        className={`flex-1 rounded-full px-3 py-1.5 font-semibold transition ${
          mode === "tester" ? "bg-draft text-white" : "text-[var(--tma-hint)]"
        } ${canTest ? "" : "opacity-40"}`}
        onClick={() => canTest && onChange("tester")}
        title={canTest ? "Жёлтый слой черновиков" : "Доступен ролям tester/admin"}
      >
        Tester 🧪
      </button>
    </div>
  );
}
