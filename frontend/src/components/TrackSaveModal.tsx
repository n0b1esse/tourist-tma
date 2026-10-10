"use client";

import { useState } from "react";

import type { ActivityType, Difficulty } from "@/types";
import { calcTrackStats, estimateCalories, formatDuration } from "@/utils/track";
import type { LiveTrack } from "./GpsTracker";
import ActivityPicker from "./ActivityPicker";

const DIFFS: Difficulty[] = ["Легкий", "Средний", "Сложный", "Экстремальный"];

/** Форма сохранения/публикации завершённого трека (ТЗ §3). */
export default function TrackSaveModal({
  track,
  initialActivity,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  track: LiveTrack;
  initialActivity: ActivityType;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    description: string | null;
    activity_type: ActivityType;
    difficulty: Difficulty;
    photo_url: string | null;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [activity, setActivity] = useState<ActivityType>(initialActivity);
  const [diff, setDiff] = useState<Difficulty>("Средний");

  const stats = calcTrackStats(track.points);
  const calories = estimateCalories(track.distanceKm, activity);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div className="w-full max-w-md space-y-3 rounded-2xl bg-[var(--tma-bg)] p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-h1">🏁 Трек готов!</h2>
          <button onClick={onClose} className="px-2 text-[var(--tma-hint)]">✕</button>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center text-caption">
          <div className="rounded-xl bg-[var(--tma-secondary-bg)] p-2">
            <div className="text-h2">{track.distanceKm.toFixed(2)}</div>км
          </div>
          <div className="rounded-xl bg-[var(--tma-secondary-bg)] p-2">
            <div className="text-h2">{formatDuration(track.durationSec)}</div>время
          </div>
          <div className="rounded-xl bg-[var(--tma-secondary-bg)] p-2">
            <div className="text-h2">{track.elevationGainM}</div>набор, м
          </div>
          <div className="rounded-xl bg-[var(--tma-secondary-bg)] p-2">
            <div className="text-h2">{track.steps.toLocaleString("ru-RU")}</div>шаги
          </div>
        </div>
        <p className="text-caption text-[var(--tma-hint)]">
          ~{calories} ккал · {track.points.length} GPS-точек · макс {stats.maxElevationM ?? "—"} м
        </p>
        <ActivityPicker value={activity} onChange={setActivity} />
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
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Название трека *"
          className="w-full rounded-xl bg-[var(--tma-secondary-bg)] p-2.5 text-body"
        />
        <textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Описание, впечатления, советы…"
          rows={2}
          className="w-full rounded-xl bg-[var(--tma-secondary-bg)] p-2.5 text-body"
        />
        <p className="text-caption text-[var(--tma-hint)]">
          Админ публикует сразу · тестер — на модерацию · гость — в «Мои прогулки»
        </p>
        <button
          disabled={saving || !title.trim()}
          onClick={() =>
            onSubmit({
              title: title.trim(),
              description: desc || null,
              activity_type: activity,
              difficulty: diff,
              photo_url: null,
            })
          }
          className="w-full rounded-xl bg-success py-2.5 font-bold text-white disabled:opacity-50"
        >
          {saving ? "Сохраняем…" : "💾 Сохранить трек"}
        </button>
        {error && <p className="text-body text-accent">{error}</p>}
      </div>
    </div>
  );
}
