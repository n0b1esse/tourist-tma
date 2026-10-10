"use client";

import type { RouteItem } from "@/types";

const difficultyColor: Record<string, string> = {
  Легкий: "#52B788",
  Средний: "#F4A261",
  Сложный: "#E07A5F",
};

/** Карточка маршрута в списке (Шаг 4). */
export default function RouteCard({
  route,
  onShowOnMap,
}: {
  route: RouteItem;
  onShowOnMap: (id: number) => void;
}) {
  return (
    <div className="rounded-2xl bg-[var(--tma-secondary-bg)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-h2">{route.title}</h2>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-caption text-white"
          style={{ background: difficultyColor[route.difficulty] ?? "#2D6A4F" }}
        >
          {route.difficulty}
        </span>
      </div>
      {route.description && (
        <p className="mt-1 text-body text-[var(--tma-hint)]">{route.description}</p>
      )}
      <div className="mt-2 flex gap-4 text-caption text-[var(--tma-hint)]">
        <span>📏 {route.distance_km} км</span>
        <span>⛰ {route.elevation_gain_m} м</span>
        {route.estimated_time && <span>⏱ {route.estimated_time}</span>}
      </div>
      <button
        className="mt-3 w-full rounded-xl bg-primary py-2 font-semibold text-white"
        onClick={() => onShowOnMap(route.id)}
      >
        Показать на карте
      </button>
    </div>
  );
}
