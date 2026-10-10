"use client";

import { useEffect, useRef, useState } from "react";

import type { ActivityType, TrackPoint } from "@/types";
import { calcTrackStats, estimateStepsFromDistance, formatDuration } from "@/utils/track";
import { gpsStepsForDistance, startMotionSteps } from "@/utils/pedometer";
import ActivityPicker from "./ActivityPicker";

export interface LiveTrack {
  points: TrackPoint[];
  steps: number;
  distanceKm: number;
  elevationGainM: number;
  durationSec: number;
}

/**
 * GPS-трекер записи в реальном времени (ТЗ §3).
 * watchPosition + фильтр шума, живые дистанция/время/высота/скорость/шаги.
 */
export default function GpsTracker({
  onFinish,
  onUpdate,
}: {
  onFinish: (track: LiveTrack, activity: ActivityType) => void;
  onUpdate?: (track: LiveTrack) => void;
}) {
  const [activity, setActivity] = useState<ActivityType>("hiking");
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [points, setPoints] = useState<TrackPoint[]>([]);
  const [steps, setSteps] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState(0);
  const watchId = useRef<number | null>(null);
  const stopMotion = useRef<(() => void) | null>(null);
  const lastGpsDist = useRef(0);
  const startTime = useRef<number | null>(null);
  const [, force] = useState(0);

  const stats = calcTrackStats(points);

  // Тикающий таймер для длительности
  useEffect(() => {
    if (!recording || paused) return;
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [recording, paused]);

  useEffect(() => {
    onUpdate?.({
      points,
      steps,
      distanceKm: stats.distanceKm,
      elevationGainM: stats.elevationGainM,
      durationSec: liveDuration(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, steps]);

  function liveDuration(): number {
    if (startTime.current == null) return 0;
    return Math.round((Date.now() - startTime.current) / 1000);
  }

  function pushPosition(pos: GeolocationPosition) {
    const { latitude, longitude, altitude, accuracy } = pos.coords;
    if (accuracy != null && accuracy > 50) {
      setDropped((d) => d + 1);
      return; // GPS-шум: плохая точность
    }
    setPoints((prev) => {
      if (prev.length > 0) {
        const last = prev[prev.length - 1];
        const dx =
          6371000 *
          2 *
          Math.asin(
            Math.sqrt(
              Math.sin(((latitude - last.lat) * Math.PI) / 180 / 2) ** 2 +
                Math.cos((last.lat * Math.PI) / 180) *
                  Math.cos((latitude * Math.PI) / 180) *
                  Math.sin(((longitude - last.lon) * Math.PI) / 180 / 2) ** 2,
            ),
          );
        if (dx < 5) {
          setDropped((d) => d + 1);
          return prev; // стоим на месте — не плодим точки
        }
      }
      const next = [
        ...prev,
        { lat: latitude, lon: longitude, ele: altitude ?? null, t: Date.now() },
      ];
      // GPS-фолбэк шагов на прирост дистанции
      const s = calcTrackStats(next);
      const gpsSteps = gpsStepsForDistance(s.distanceKm - lastGpsDist.current, activity);
      if (gpsSteps > 0) {
        lastGpsDist.current = s.distanceKm;
        setSteps((v) => v + gpsSteps);
      }
      return next;
    });
  }

  function start() {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Геолокация недоступна в этом браузере");
      return;
    }
    setPoints([]);
    setSteps(0);
    setDropped(0);
    lastGpsDist.current = 0;
    startTime.current = Date.now();
    setRecording(true);
    setPaused(false);
    // Motion-шаги параллельно с GPS
    try {
      stopMotion.current = startMotionSteps(() => setSteps((v) => v + 1));
    } catch {
      /* без датчика — только GPS-фолбэк */
    }
    watchId.current = navigator.geolocation.watchPosition(pushPosition, (e) => setError(e.message), {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 15000,
    });
  }

  function togglePause() {
    if (watchId.current != null && !paused) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setPaused(true);
    } else if (paused) {
      watchId.current = navigator.geolocation.watchPosition(pushPosition, (e) => setError(e.message), {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      });
      setPaused(false);
    }
  }

  function stop(cancel = false) {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    stopMotion.current?.();
    stopMotion.current = null;
    setRecording(false);
    setPaused(false);
    if (!cancel && points.length >= 2) {
      const finalStats = calcTrackStats(points);
      const finalSteps =
        steps > 0 ? steps : estimateStepsFromDistance(finalStats.distanceKm, activity);
      onFinish(
        {
          points,
          steps: finalSteps,
          distanceKm: finalStats.distanceKm,
          elevationGainM: finalStats.elevationGainM,
          durationSec: liveDuration(),
        },
        activity,
      );
    }
    if (cancel) {
      setPoints([]);
      setSteps(0);
    }
  }

  useEffect(() => {
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      stopMotion.current?.();
    };
  }, []);

  if (!recording) {
    return (
      <div className="space-y-3 rounded-2xl bg-[var(--tma-secondary-bg)] p-4">
        <h2 className="text-h2">⏺ Запись трека</h2>
        <ActivityPicker value={activity} onChange={setActivity} />
        <button onClick={start} className="w-full rounded-2xl bg-accent py-3 font-bold text-white">
          ⏺ Начать запись
        </button>
        <p className="text-caption text-[var(--tma-hint)]">
          GPS-трек + шаги (датчик + GPS-фолбэк). Фильтр шума: точность ≤50 м, шаг ≥5 м.
        </p>
        {error && <p className="text-body text-accent">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-2xl border-2 border-accent bg-[var(--tma-secondary-bg)] p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-bold text-accent">
          <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
          REC {paused ? "— пауза" : ""}
        </span>
        <span className="text-caption text-[var(--tma-hint)]">{points.length} точек · отсев {dropped}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-[var(--tma-bg)] p-2">
          <div className="text-h2">{stats.distanceKm.toFixed(2)}</div>
          <div className="text-caption text-[var(--tma-hint)]">км</div>
        </div>
        <div className="rounded-xl bg-[var(--tma-bg)] p-2">
          <div className="text-h2">{formatDuration(liveDuration())}</div>
          <div className="text-caption text-[var(--tma-hint)]">время</div>
        </div>
        <div className="rounded-xl bg-[var(--tma-bg)] p-2">
          <div className="text-h2">👟 {steps.toLocaleString("ru-RU")}</div>
          <div className="text-caption text-[var(--tma-hint)]">шаги</div>
        </div>
        <div className="rounded-xl bg-[var(--tma-bg)] p-2">
          <div className="text-h2">{stats.elevationGainM}</div>
          <div className="text-caption text-[var(--tma-hint)]">набор, м</div>
        </div>
        <div className="rounded-xl bg-[var(--tma-bg)] p-2">
          <div className="text-h2">{stats.currentSpeedKmh || stats.avgSpeedKmh}</div>
          <div className="text-caption text-[var(--tma-hint)]">км/ч</div>
        </div>
        <div className="rounded-xl bg-[var(--tma-bg)] p-2">
          <div className="text-h2">{stats.maxElevationM ?? "—"}</div>
          <div className="text-caption text-[var(--tma-hint)]">макс, м</div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={togglePause} className="flex-1 rounded-xl bg-[var(--tma-bg)] py-2 font-semibold">
          {paused ? "▶ Продолжить" : "⏸ Пауза"}
        </button>
        <button onClick={() => stop(false)} className="flex-1 rounded-xl bg-success py-2 font-bold text-white">
          ⏹ Завершить
        </button>
        <button onClick={() => stop(true)} className="rounded-xl bg-[var(--tma-bg)] px-3 py-2" title="Отменить запись">
          ✕
        </button>
      </div>
      {error && <p className="text-caption text-accent">{error}</p>}
    </div>
  );
}
