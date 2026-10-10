"use client";

import { useState } from "react";

import type { RouteItem, WaypointCreate, WaypointType } from "@/types";
import { tokens } from "@/styles/tokens";

const TYPES: WaypointType[] = ["water", "camp", "hazard", "viewpoint", "rest"];

/** Модалка создания точки тестером: клик по карте -> тип + данные -> POST (Шаг 5). */
export default function AddWaypointModal({
  latitude,
  longitude,
  routes,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  latitude: number;
  longitude: number;
  routes: RouteItem[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: WaypointCreate) => void;
}) {
  const [type, setType] = useState<WaypointType>("water");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [routeId, setRouteId] = useState<string>("");

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40">
      <div className="w-full max-w-md rounded-t-3xl bg-[var(--tma-bg)] p-4 pb-[env(safe-area-inset-bottom)]">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-h2">Новая точка (draft)</h2>
          <button onClick={onClose} className="px-2 py-1 text-h2 text-[var(--tma-hint)]">
            ✕
          </button>
        </div>
        <p className="mb-3 text-caption text-[var(--tma-hint)]">
          {latitude.toFixed(5)}, {longitude.toFixed(5)} — увидит только жёлтый слой
        </p>

        <label className="mb-1 block text-caption text-[var(--tma-hint)]">Тип</label>
        <div className="mb-3 grid grid-cols-5 gap-1">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              title={tokens.typeLabel[t]}
              className={`rounded-xl border-2 py-2 text-lg ${
                type === t ? "border-draft bg-draft/20" : "border-transparent bg-[var(--tma-secondary-bg)]"
              }`}
            >
              {tokens.typeEmoji[t]}
            </button>
          ))}
        </div>
        <div className="mb-3 text-center text-body font-semibold">{tokens.typeLabel[type]}</div>

        <input
          className="mb-2 w-full rounded-xl bg-[var(--tma-secondary-bg)] p-2.5 text-body"
          placeholder="Название (необязательно)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="mb-2 w-full rounded-xl bg-[var(--tma-secondary-bg)] p-2.5 text-body"
          placeholder="Описание (необязательно)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <select
          className="mb-3 w-full rounded-xl bg-[var(--tma-secondary-bg)] p-2.5 text-body"
          value={routeId}
          onChange={(e) => setRouteId(e.target.value)}
        >
          <option value="">Без маршрута</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>

        {error && <p className="mb-2 text-body text-accent">{error}</p>}

        <button
          disabled={saving}
          onClick={() =>
            onSubmit({
              type,
              latitude,
              longitude,
              title: title.trim() || null,
              description: description.trim() || null,
              route_id: routeId ? Number(routeId) : null,
            })
          }
          className="w-full rounded-xl bg-draft py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Отправка…" : "Создать черновик"}
        </button>
      </div>
    </div>
  );
}
