"use client";

import type { Tab, UserRole } from "@/types";

const baseTabs: { id: Tab; label: string; icon: string }[] = [
  { id: "home", label: "Главное", icon: "🏠" },
  { id: "map", label: "Карта", icon: "🗺" },
  { id: "routes", label: "Маршруты", icon: "🥾" },
  { id: "profile", label: "Профиль", icon: "👤" },
];

/** Нижняя навигация Mini App (ТЗ §3–§4: + Главное, + Админка только super_admin). */
export default function BottomNavigation({
  tab,
  role,
  onChange,
}: {
  tab: Tab;
  role: UserRole | null;
  onChange: (t: Tab) => void;
}) {
  const tabs =
    role === "super_admin"
      ? [...baseTabs, { id: "admin" as Tab, label: "Админка", icon: "🛠" }]
      : baseTabs;
  return (
    <nav className="fixed bottom-0 left-0 right-0 flex border-t border-black/10 bg-[var(--tma-bg)] pb-[env(safe-area-inset-bottom)]">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex flex-1 flex-col items-center py-2 text-caption ${
            tab === t.id ? "text-primary font-semibold" : "text-[var(--tma-hint)]"
          }`}
        >
          <span className="text-lg">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
