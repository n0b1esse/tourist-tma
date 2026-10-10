"use client";

import { useMemo, useState } from "react";

import type { RouteItem, WaypointItem } from "@/types";
import { distanceM } from "@/utils/telegram";
import RouteCard from "./RouteCard";

const BANNERS = [
  {
    emoji: "🏔️",
    title: "Ала-Арча — жемчужина Тянь-Шаня",
    text: "Топ хайков выходного дня из Бишкека",
    gradient: "linear-gradient(135deg,#2D6A4F,#52B788)",
  },
  {
    emoji: "🏞️",
    title: "Иссык-Куль 2026",
    text: "Озёра, каньоны и новые кемпинги",
    gradient: "linear-gradient(135deg,#1D3557,#457B9D)",
  },
  {
    emoji: "🥾",
    title: "Чек-инься и собирай бейджи",
    text: "«Первый хайк» · «Покоритель 3000м» · «Легенда Бишкека»",
    gradient: "linear-gradient(135deg,#E07A5F,#F4A261)",
  },
];

const DIFFS = ["Все", "Легкий", "Средний", "Сложный", "Экстремальный"] as const;

/** Главная: промо-баннеры + ближайшие хайки с фильтрами (ТЗ §4А). */
export default function HomePage({
  routes,
  waypoints,
  userLocation,
  onShowOnMap,
}: {
  routes: RouteItem[];
  waypoints: WaypointItem[];
  userLocation: { lat: number; lon: number; granted: boolean } | null;
  onShowOnMap: (id: number) => void;
}) {
  const [banner, setBanner] = useState(0);
  const [diff, setDiff] = useState<(typeof DIFFS)[number]>("Все");
  const [maxDist, setMaxDist] = useState<string>("all");
  const [sort, setSort] = useState<"near" | "rating" | "distance">("near");

  const enriched = useMemo(() => {
    return routes.map((r) => {
      // Близость маршрута: минимум по published-точкам? иначе Infinity
      let near = Infinity;
      if (userLocation?.granted) {
        for (const w of waypoints) {
          if (w.route_id !== r.id) continue;
          const d = distanceM(userLocation.lat, userLocation.lon, w.latitude, w.longitude);
          if (d < near) near = d;
        }
      }
      return { r, near };
    });
  }, [routes, waypoints, userLocation]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (diff !== "Все") list = list.filter(({ r }) => r.difficulty === diff);
    if (maxDist !== "all") {
      const km = Number(maxDist);
      list = list.filter(({ r }) => r.distance_km <= km);
    }
    const sorted = [...list];
    if (sort === "near") sorted.sort((a, b) => a.near - b.near);
    if (sort === "distance") sorted.sort((a, b) => a.r.distance_km - b.r.distance_km);
    if (sort === "rating") sorted.sort((a, b) => (b.r.rating ?? 0) - (a.r.rating ?? 0));
    return sorted;
  }, [enriched, diff, maxDist, sort]);

  const b = BANNERS[banner % BANNERS.length];

  return (
    <div className="space-y-4">
      {/* Промо-карусель */}
      <div className="relative overflow-hidden rounded-2xl p-4 text-white" style={{ background: b.gradient }}>
        <div className="text-3xl">{b.emoji}</div>
        <div className="mt-1 text-h2">{b.title}</div>
        <div className="text-body opacity-90">{b.text}</div>
        <div className="mt-3 flex gap-2">
          {BANNERS.map((_, i) => (
            <button
              key={i}
              onClick={() => setBanner(i)}
              className={`h-1.5 flex-1 rounded-full ${i === banner % BANNERS.length ? "bg-white" : "bg-white/40"}`}
              aria-label={`Баннер ${i + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Фильтры */}
      <div className="space-y-2">
        <div className="text-h2">🥾 Ближайшие хайки</div>
        {!userLocation?.granted && (
          <p className="text-caption text-[var(--tma-hint)]">
            GPS недоступен — показываем все маршруты. Разреши геолокацию для сортировки по близости.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {DIFFS.map((d) => (
            <button
              key={d}
              onClick={() => setDiff(d)}
              className={`rounded-full px-3 py-1 text-caption font-semibold ${
                diff === d ? "bg-primary text-white" : "bg-[var(--tma-secondary-bg)] text-[var(--tma-hint)]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select
            value={maxDist}
            onChange={(e) => setMaxDist(e.target.value)}
            className="flex-1 rounded-xl bg-[var(--tma-secondary-bg)] p-2 text-caption"
          >
            <option value="all">Любая длительность</option>
            <option value="5">До 5 км</option>
            <option value="10">До 10 км</option>
            <option value="20">До 20 км</option>
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="flex-1 rounded-xl bg-[var(--tma-secondary-bg)] p-2 text-caption"
          >
            <option value="near">Сначала ближние</option>
            <option value="rating">По рейтингу</option>
            <option value="distance">По километражу</option>
          </select>
        </div>
      </div>

      {/* Список */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-body text-[var(--tma-hint)]">Ничего не найдено — попробуй смягчить фильтры.</p>
        )}
        {filtered.map(({ r, near }) => (
          <div key={r.id} className="relative">
            {Number.isFinite(near) && (
              <div className="absolute right-3 top-3 z-10 rounded-full bg-black/50 px-2 py-0.5 text-caption text-white">
                {(near / 1000).toFixed(1)} км от тебя
              </div>
            )}
            <RouteCard route={r} onShowOnMap={onShowOnMap} />
          </div>
        ))}
      </div>
    </div>
  );
}
