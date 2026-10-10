"use client";

import { ACTIVITY_META, type RouteItem } from "@/types";

const difficultyColor: Record<string, string> = {
  Легкий: "#52B788",
  Средний: "#F4A261",
  Сложный: "#E07A5F",
  Экстремальный: "#9D0208",
};

const statusLabel: Record<string, string> = {
  draft: "📝 Черновик",
  review: "🔍 На модерации",
  published: "✅ Опубликован",
  rejected: "❌ Отклонён",
};

/** Карточка маршрута в списке (Шаг 4 + Fitness: активность, шаги, статус). */
export default function RouteCard({
  route,
  onShowOnMap,
  onPropose,
  showStatus,
}: {
  route: RouteItem;
  onShowOnMap: (id: number) => void;
  onPropose?: (id: number) => void;
  showStatus?: boolean;
}) {
  const act = route.activity_type ? ACTIVITY_META[route.activity_type] : null;
  return (
    <div className="rounded-2xl bg-[var(--tma-secondary-bg)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-h2">
          {act ? `${act.emoji} ` : ""}
          {route.title}
        </h2>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-caption text-white"
          style={{ background: difficultyColor[route.difficulty] ?? "#2D6A4F" }}
        >
          {route.difficulty}
        </span>
      </div>
      {act && <div className="mt-0.5 text-caption text-[var(--tma-hint)]">{act.label}</div>}
      {route.description && (
        <p className="mt-1 text-body text-[var(--tma-hint)]">{route.description}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-[var(--tma-hint)]">
        <span>📏 {route.distance_km} км</span>
        <span>⛰ {route.elevation_gain_m} м</span>
        {(route.steps_count ?? 0) > 0 && <span>👟 {(route.steps_count ?? 0).toLocaleString("ru-RU")}</span>}
        {route.estimated_time && <span>⏱ {route.estimated_time}</span>}
      </div>
      {showStatus && route.status && route.status !== "published" && (
        <div className="mt-1 text-caption">{statusLabel[route.status] ?? route.status}</div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          className="flex-1 rounded-xl bg-primary py-2 font-semibold text-white"
          onClick={() => onShowOnMap(route.id)}
        >
          Показать на карте
        </button>
        {onPropose && route.status === "draft" && (
          <button
            className="rounded-xl bg-[var(--tma-bg)] px-3 py-2 font-semibold"
            onClick={() => onPropose(route.id)}
            title="Предложить гидам на публикацию"
          >
            📤 Гидам
          </button>
        )}
      </div>
    </div>
  );
}
