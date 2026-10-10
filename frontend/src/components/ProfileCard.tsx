"use client";

import type { Profile, RouteItem } from "@/types";
import PedometerWidget from "./PedometerWidget";
import RouteCard from "./RouteCard";

const roleLabel: Record<string, string> = {
  user: "Путешественник",
  tester: "Тестер 🧪",
  admin: "Гид / Админ 🛠",
  super_admin: "Супер-админ 👑",
};

const ALL_BADGES = [
  { code: "first_hike", title: "Первый хайк", desc: "Сделай первый чек-ин" },
  { code: "conqueror_3000", title: "Покоритель 3000м", desc: "Набери 3000 м высоты" },
  { code: "bishkek_legend", title: "Легенда Бишкека", desc: "10 чек-инов" },
  { code: "first_10k_steps", title: "Первые 10 000 шагов", desc: "10 000 шагов за день 👟" },
  { code: "marathon_50k", title: "Марафонец (50 км)", desc: "Суммарно 50 км треков" },
  { code: "trail_conqueror", title: "Покоритель троп", desc: "Заверши 5 записанных треков" },
  { code: "early_bird_50k_steps", title: "Шагомер PRO", desc: "50 000 суммарных шагов" },
  { code: "calorie_burner", title: "Сжигатель калорий", desc: "Сожги 2000 ккал" },
];

/** Профиль: статистика + шагомер + «Мои маршруты и активность» + бейджи. */
export default function ProfileCard({
  profile,
  telegramId,
  myRoutes,
  onShowOnMap,
  onPropose,
}: {
  profile: Profile;
  telegramId: number | null;
  myRoutes?: RouteItem[];
  onShowOnMap?: (id: number) => void;
  onPropose?: (id: number) => void;
}) {
  const owned = new Set(profile.achievements.map((a) => a.code_name));
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-primary p-4 text-white">
        <div className="text-h1">{profile.full_name ?? profile.username ?? "Без имени"}</div>
        <div className="mt-1 text-caption opacity-80">
          {roleLabel[profile.role] ?? profile.role} · ID {profile.telegram_id}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-body">
          <span>📏 {(profile.total_distance_km ?? 0).toFixed(1)} км</span>
          <span>⛰ {profile.total_elevation_m} м</span>
          <span>👟 {(profile.total_steps ?? 0).toLocaleString("ru-RU")} шагов</span>
          <span>🔥 {(profile.total_calories ?? 0).toFixed(0)} ккал</span>
          <span>🥾 {profile.total_hikes ?? 0} хайков</span>
          <span>📍 {profile.checkins_count ?? 0} чек-инов</span>
          <span>🗺 {profile.visited_locations ?? 0} локаций</span>
        </div>
      </div>

      <PedometerWidget telegramId={telegramId} />

      <div>
        <h2 className="mb-2 text-h2">
          🗺 Мои маршруты и активность {myRoutes ? `(${myRoutes.length})` : ""}
        </h2>
        {myRoutes == null ? (
          <p className="text-body text-[var(--tma-hint)]">Загрузка…</p>
        ) : myRoutes.length === 0 ? (
          <p className="text-body text-[var(--tma-hint)]">
            Пока пусто — запиши первый трек во вкладке «Запись» ⏺
          </p>
        ) : (
          <div className="space-y-2">
            {myRoutes.map((r) => (
              <RouteCard
                key={r.id}
                route={r}
                showStatus
                onShowOnMap={(id) => onShowOnMap?.(id)}
                onPropose={onPropose}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-h2">Достижения</h2>
        <div className="grid grid-cols-1 gap-2">
          {ALL_BADGES.map((b) => {
            const has = owned.has(b.code);
            const custom = profile.achievements.find((a) => a.code_name === b.code);
            return (
              <div
                key={b.code}
                className={`rounded-xl p-3 ${has ? "bg-[var(--tma-secondary-bg)]" : "bg-[var(--tma-secondary-bg)] opacity-50"}`}
              >
                <div className="font-semibold">
                  {has ? "🏅" : "🔒"} {custom?.title ?? b.title}
                </div>
                <div className="text-caption text-[var(--tma-hint)]">
                  {custom?.description ?? b.desc}
                </div>
              </div>
            );
          })}
          {profile.achievements
            .filter((a) => !ALL_BADGES.some((b) => b.code === a.code_name))
            .map((a) => (
              <div key={a.code_name} className="rounded-xl bg-[var(--tma-secondary-bg)] p-3">
                <div className="font-semibold">🏅 {a.title}</div>
                {a.description && (
                  <div className="text-caption text-[var(--tma-hint)]">{a.description}</div>
                )}
              </div>
            ))}
        </div>
        {profile.achievements.length === 0 && (
          <p className="mt-2 text-body text-[var(--tma-hint)]">
            Пока пусто — запиши трек или сделай чек-ин, бейджи появятся здесь.
          </p>
        )}
      </div>
    </div>
  );
}
