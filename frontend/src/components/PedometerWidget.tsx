"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { StepsStats } from "@/types";
import { getStepsStats, logSteps } from "@/utils/api";
import {
  gpsStepsForDistance,
  isMotionSupported,
  loadLocalSteps,
  requestMotionPermission,
  saveLocalSteps,
  startMotionSteps,
} from "@/utils/pedometer";

/**
 * Виджет шагомера: текущие шаги, суточная цель, мини-график неделя/месяц.
 * Источники: DeviceMotion (датчик) + GPS-фолбэк (дистанция трека) + ручной ввод.
 */
export default function PedometerWidget({
  telegramId,
  liveSteps,
  liveDistanceKm,
  compact,
}: {
  telegramId: number | null;
  liveSteps?: number;
  liveDistanceKm?: number;
  compact?: boolean;
}) {
  const [stats, setStats] = useState<StepsStats | null>(null);
  const [range, setRange] = useState<"week" | "month">("week");
  const [motionSteps, setMotionSteps] = useState(0);
  const [motionOn, setMotionOn] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const pendingSync = useRef(0);

  const load = useCallback(async () => {
    if (telegramId == null) return;
    try {
      setStats(await getStepsStats(telegramId, range));
    } catch {
      /* offline — показываем локальные */
    }
  }, [telegramId, range]);

  useEffect(() => {
    void load();
  }, [load]);

  // Локальные шаги при монтировании (фон между сессиями)
  useEffect(() => {
    const local = loadLocalSteps();
    setMotionSteps(local.steps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    saveLocalSteps(motionSteps);
  }, [motionSteps]);

  const toggleMotion = async () => {
    if (motionOn) {
      stopRef.current?.();
      stopRef.current = null;
      setMotionOn(false);
      return;
    }
    if (!isMotionSupported()) {
      setSyncMsg("Датчик шагов недоступен — считаем по GPS-дистанции 🛰");
      return;
    }
    const ok = await requestMotionPermission();
    if (!ok) {
      setSyncMsg("Нет доступа к датчику движения — считаем по GPS 🛰");
      return;
    }
    stopRef.current = startMotionSteps(() => {
      setMotionSteps((s) => s + 1);
      pendingSync.current += 1;
    });
    setMotionOn(true);
  };

  useEffect(() => {
    return () => stopRef.current?.();
  }, []);

  // Авто-синк накопленных motion-шагов каждые 30 c
  useEffect(() => {
    if (telegramId == null) return;
    const timer = setInterval(async () => {
      const delta = pendingSync.current;
      if (delta <= 0) return;
      pendingSync.current = 0;
      try {
        const res = await logSteps(telegramId, { steps: delta });
        if (res.awarded.length > 0) setSyncMsg(`🏅 ${res.awarded.join(", ")}!`);
        await load();
      } catch {
        pendingSync.current += delta; // вернём при следующем тике
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [telegramId, load]);

  const syncNow = async () => {
    if (telegramId == null) return;
    const delta = pendingSync.current + (liveSteps != null ? 0 : 0);
    // GPS-фолбэк из живой дистанции трека
    const gpsSteps = liveDistanceKm != null ? gpsStepsForDistance(liveDistanceKm) : 0;
    const total = delta + gpsSteps;
    if (total <= 0 && motionSteps <= 0) {
      setSyncMsg("Пока нечего синкать — начни запись трека 🥾");
      return;
    }
    try {
      const payload = total > 0 ? total : motionSteps;
      const res = await logSteps(telegramId, { steps: payload, distance_km: liveDistanceKm ?? 0 });
      pendingSync.current = 0;
      setSyncMsg(
        res.awarded.length > 0 ? `✅ Синк! 🏅 ${res.awarded.join(", ")}!` : `✅ Синкнуто ${payload} шагов`,
      );
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const today = stats?.today.steps ?? motionSteps;
  const goal = 10000;
  const pct = Math.min(100, Math.round((today / goal) * 100));
  const displaySteps = Math.max(today, motionSteps + (liveSteps ?? 0));
  const series = stats?.series.slice(-(range === "week" ? 7 : 30)) ?? [];
  const maxV = Math.max(1, ...series.map((s) => s.steps));

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-[var(--tma-secondary-bg)] px-3 py-2">
        <span className="text-lg">👟</span>
        <span className="text-body font-bold">{displaySteps.toLocaleString("ru-RU")}</span>
        <span className="text-caption text-[var(--tma-hint)]">шагов сегодня</span>
        <div className="ml-auto h-1.5 w-20 overflow-hidden rounded-full bg-black/10">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl bg-[var(--tma-secondary-bg)] p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-h2">👟 Шагомер</h2>
        <div className="flex gap-1">
          {(["week", "month"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-2.5 py-1 text-caption font-semibold ${
                range === r ? "bg-primary text-white" : "text-[var(--tma-hint)]"
              }`}
            >
              {r === "week" ? "Неделя" : "Месяц"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-3xl font-extrabold">{displaySteps.toLocaleString("ru-RU")}</span>
        <span className="pb-1 text-caption text-[var(--tma-hint)]">/ {goal.toLocaleString("ru-RU")} сегодня</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: pct >= 100 ? "#52B788" : "#2D6A4F" }}
        />
      </div>
      {liveDistanceKm != null && liveDistanceKm > 0 && (
        <p className="text-caption text-[var(--tma-hint)]">
          🛰 GPS-фолбэк активного трека: ~{gpsStepsForDistance(liveDistanceKm).toLocaleString("ru-RU")} шагов
          ({liveDistanceKm.toFixed(2)} км)
        </p>
      )}

      {/* Мини-график */}
      {series.length > 0 && (
        <div className="flex h-16 items-end gap-1">
          {series.map((s) => (
            <div key={s.date} className="flex flex-1 flex-col items-center gap-0.5" title={`${s.date}: ${s.steps}`}>
              <div
                className="w-full rounded-t bg-primary/80"
                style={{ height: `${Math.max(3, Math.round((s.steps / maxV) * 56))}px`, opacity: s.steps > 0 ? 1 : 0.25 }}
              />
              <span className="text-[9px] text-[var(--tma-hint)]">{s.date.slice(5)}</span>
            </div>
          ))}
        </div>
      )}
      {stats && (
        <p className="text-caption text-[var(--tma-hint)]">
          {range === "week" ? "За неделю" : "За месяц"}: {stats.totals.steps.toLocaleString("ru-RU")} шагов ·{" "}
          {stats.totals.distance_km} км · {stats.totals.calories} ккал
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={toggleMotion}
          className={`flex-1 rounded-xl py-2 text-body font-semibold ${
            motionOn ? "bg-accent text-white" : "bg-primary text-white"
          }`}
        >
          {motionOn ? "⏸ Датчик вкл — выкл" : "▶ Включить датчик шагов"}
        </button>
        <button
          onClick={syncNow}
          className="rounded-xl bg-[var(--tma-bg)] px-3 py-2 text-body font-semibold"
          title="Отправить шаги на сервер"
        >
          ☁️ Синк
        </button>
      </div>
      {syncMsg && <p className="text-caption text-[var(--tma-hint)]">{syncMsg}</p>}
    </div>
  );
}
