"use client";

import { useState } from "react";

import type { ActivityType, TrackPoint } from "@/types";
import {
  buildGpx,
  buildKml,
  calcTrackStats,
  downloadFile,
  formatDuration,
  parseGpxText,
  parseKmlText,
} from "@/utils/track";
import { createRoute, importTrack } from "@/utils/api";
import ActivityPicker from "./ActivityPicker";

/**
 * Ручной конструктор маршрутов (admin / super_admin):
 * точки кликом по карте (через onPickHint), редактирование списка,
 * экспорт/импорт .gpx и .kml, публикация на бэкенд.
 */
export default function RouteDrawer({
  telegramId,
  draftPoints,
  onDraftChange,
  onPublished,
}: {
  telegramId: number | null;
  draftPoints: TrackPoint[];
  onDraftChange: (pts: TrackPoint[]) => void;
  onPublished: () => void;
}) {
  const [activity, setActivity] = useState<ActivityType>("hiking");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const stats = calcTrackStats(draftPoints);

  function removeAt(i: number) {
    onDraftChange(draftPoints.filter((_, k) => k !== i));
  }

  function clear() {
    onDraftChange([]);
    setMsg(null);
  }

  function undo() {
    onDraftChange(draftPoints.slice(0, -1));
  }

  async function handleFile(file: File) {
    setMsg(null);
    const text = await file.text();
    const isKml = file.name.toLowerCase().endsWith(".kml");
    // Локальный парсинг для мгновенного превью
    const local = isKml ? parseKmlText(text) : parseGpxText(text);
    if (local.length >= 2) {
      onDraftChange(local.slice(0, 5000));
      const s = calcTrackStats(local);
      setMsg(`📂 ${file.name}: ${local.length} точек, ${s.distanceKm.toFixed(2)} км`);
      return;
    }
    // Серверный парсинг как запасной путь
    if (telegramId == null) {
      setMsg("В файле меньше 2 точек");
      return;
    }
    try {
      const res = await importTrack(telegramId, {
        content: text.slice(0, 2_000_000),
        format: isKml ? "kml" : "gpx",
      });
      onDraftChange(res.points);
      setMsg(`📂 Сервер распарсил: ${res.points.length} точек, ${res.distance_km.toFixed(2)} км`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  function doExport(fmt: "gpx" | "kml") {
    const name = (title || "route").replace(/[^\w\-а-яё]+/gi, "_");
    if (fmt === "gpx") downloadFile(`${name}.gpx`, buildGpx(title || "Маршрут", draftPoints), "application/gpx+xml");
    else downloadFile(`${name}.kml`, buildKml(title || "Маршрут", draftPoints), "application/vnd.google-earth.kml+xml");
  }

  async function publish() {
    if (telegramId == null) return;
    if (!title.trim()) {
      setMsg("Дай название маршруту");
      return;
    }
    if (draftPoints.length < 2) {
      setMsg("Нужно минимум 2 точки — кликай по карте ✏️");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await createRoute(telegramId, {
        title: title.trim(),
        description: desc || null,
        activity_type: activity,
        difficulty: "Средний",
        distance_km: stats.distanceKm,
        elevation_gain_m: stats.elevationGainM,
        max_elevation_m: stats.maxElevationM,
        track_points: draftPoints,
      });
      setMsg("✅ Маршрут опубликован!");
      setTitle("");
      setDesc("");
      onDraftChange([]);
      onPublished();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-primary bg-[var(--tma-secondary-bg)] p-4">
      <h2 className="text-h2">✏️ Конструктор маршрутов</h2>
      <p className="text-caption text-[var(--tma-hint)]">
        Кликай по карте — точки добавятся сюда. Перетаскивать нельзя, но можно удалять по одной.
      </p>
      <ActivityPicker value={activity} onChange={setActivity} compact />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Название (например, Кёль-Тор через перевал)"
        className="w-full rounded-xl bg-[var(--tma-bg)] p-2 text-body"
      />
      <input
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        placeholder="Описание (необязательно)"
        className="w-full rounded-xl bg-[var(--tma-bg)] p-2 text-body"
      />
      <div className="flex flex-wrap gap-2 text-caption">
        <span className="rounded-full bg-[var(--tma-bg)] px-2 py-1">
          📏 {stats.distanceKm.toFixed(2)} км
        </span>
        <span className="rounded-full bg-[var(--tma-bg)] px-2 py-1">⛰ {stats.elevationGainM} м</span>
        <span className="rounded-full bg-[var(--tma-bg)] px-2 py-1">
          ⏱ {formatDuration(stats.durationSec)}
        </span>
        <span className="rounded-full bg-[var(--tma-bg)] px-2 py-1">📍 {draftPoints.length} точек</span>
      </div>
      {draftPoints.length > 0 && (
        <div className="max-h-28 space-y-1 overflow-y-auto text-caption">
          {draftPoints.slice(-8).map((p, i) => (
            <div key={`${p.lat}-${p.lon}-${i}`} className="flex items-center justify-between gap-2">
              <span>
                {draftPoints.length - Math.min(8, draftPoints.length) + i + 1}. {p.lat.toFixed(5)},{" "}
                {p.lon.toFixed(5)}
              </span>
              <button
                onClick={() => removeAt(draftPoints.length - Math.min(8, draftPoints.length) + i)}
                className="text-accent"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={undo} disabled={draftPoints.length === 0} className="rounded-xl bg-[var(--tma-bg)] px-3 py-1.5 text-body disabled:opacity-40">
          ↩ Отменить точку
        </button>
        <button onClick={clear} disabled={draftPoints.length === 0} className="rounded-xl bg-[var(--tma-bg)] px-3 py-1.5 text-body disabled:opacity-40">
          🗑 Очистить
        </button>
        <button onClick={() => doExport("gpx")} disabled={draftPoints.length < 2} className="rounded-xl bg-[var(--tma-bg)] px-3 py-1.5 text-body disabled:opacity-40">
          ⬇ .gpx
        </button>
        <button onClick={() => doExport("kml")} disabled={draftPoints.length < 2} className="rounded-xl bg-[var(--tma-bg)] px-3 py-1.5 text-body disabled:opacity-40">
          ⬇ .kml
        </button>
        <label className="cursor-pointer rounded-xl bg-[var(--tma-bg)] px-3 py-1.5 text-body">
          ⬆ Импорт
          <input
            type="file"
            accept=".gpx,.kml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <button
        onClick={publish}
        disabled={busy}
        className="w-full rounded-xl bg-primary py-2.5 font-bold text-white disabled:opacity-50"
      >
        {busy ? "Публикуем…" : "🚀 Опубликовать маршрут"}
      </button>
      {msg && <p className="text-body">{msg}</p>}
    </div>
  );
}
