"use client";

import type { Profile } from "@/types";

const roleLabel: Record<string, string> = {
  user: "Путешественник",
  tester: "Тестер 🧪",
  admin: "Администратор 🛠",
};

/** Карточка профиля со статистикой и ачивками (Шаг 4). */
export default function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-primary p-4 text-white">
        <div className="text-h1">{profile.full_name ?? profile.username ?? "Без имени"}</div>
        <div className="mt-1 text-caption opacity-80">
          {roleLabel[profile.role] ?? profile.role} · ID {profile.telegram_id}
        </div>
        <div className="mt-3 flex gap-4 text-body">
          <span>📏 {profile.total_distance_km} км</span>
          <span>⛰ {profile.total_elevation_m} м</span>
        </div>
      </div>
      <div>
        <h2 className="mb-2 text-h2">Достижения</h2>
        {profile.achievements.length === 0 ? (
          <p className="text-body text-[var(--tma-hint)]">
            Пока пусто — выходите на маршрут, и ачивки появятся здесь.
          </p>
        ) : (
          <div className="space-y-2">
            {profile.achievements.map((a) => (
              <div
                key={a.code_name}
                className="rounded-xl bg-[var(--tma-secondary-bg)] p-3"
              >
                <div className="font-semibold">🏅 {a.title}</div>
                {a.description && (
                  <div className="text-caption text-[var(--tma-hint)]">{a.description}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
