/** Шагомер Mini App: нативные датчики + GPS-фолбэк.
 *
 * Стратегия:
 * 1. DeviceMotionEvent (accelerometer) — пик-детектор шагов при активной записи.
 * 2. Generic Sensor / Step Counter API — если браузер отдаёт (редко в TMA).
 * 3. GPS-фолбэк — шаги = дистанция / длина шага (всегда доступен при записи трека).
 *
 * Фоново в Mini App: шагомер живёт пока открыт WebView; синк на бэкенд — дельтами
 * через POST /api/steps/log (update localStorage между сессиями).
 */

export interface StepState {
  steps: number;
  source: "motion" | "gps" | "mixed" | "manual";
  available: boolean;
}

const LS_KEY = "tma-pedometer-today";

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function loadLocalSteps(): { date: string; steps: number } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { date: string; steps: number };
      if (parsed.date === todayKey()) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { date: todayKey(), steps: 0 };
}

export function saveLocalSteps(steps: number): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ date: todayKey(), steps }));
  } catch {
    /* ignore */
  }
}

/** Запрос разрешения на motion-сенсоры (iOS 13+ требует жест пользователя). */
export async function requestMotionPermission(): Promise<boolean> {
  try {
    const DM = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DM?.requestPermission === "function") {
      const res = await DM.requestPermission();
      return res === "granted";
    }
    return typeof window !== "undefined" && "DeviceMotionEvent" in window;
  } catch {
    return false;
  }
}

export function isMotionSupported(): boolean {
  return typeof window !== "undefined" && "DeviceMotionEvent" in window;
}

/**
 * Пик-детектор шагов по акселерометру.
 * onStep вызывается на каждый распознанный шаг. Возвращает stop().
 */
export function startMotionSteps(onStep: () => void, opts?: { threshold?: number; minIntervalMs?: number }): () => void {
  const threshold = opts?.threshold ?? 1.15; // g magnitude delta
  const minInterval = opts?.minIntervalMs ?? 280;
  let lastMag: number | null = null;
  let lastStepAt = 0;
  let wasAbove = false;

  const handler = (e: DeviceMotionEvent) => {
    const acc = e.accelerationIncludingGravity ?? e.acceleration;
    if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
    const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z) / 9.81;
    if (lastMag == null) {
      lastMag = mag;
      return;
    }
    // Сглаживание + детект пика через порог
    const now = Date.now();
    const above = mag > threshold;
    if (above && !wasAbove && now - lastStepAt > minInterval) {
      lastStepAt = now;
      onStep();
    }
    wasAbove = above;
    lastMag = mag;
  };
  window.addEventListener("devicemotion", handler);
  return () => window.removeEventListener("devicemotion", handler);
}

/** GPS-фолбэк: шаги из прироста дистанции. Возвращает число новых шагов. */
export function gpsStepsForDistance(distanceKmDelta: number, activity = "hiking"): number {
  if (activity === "bike" || activity === "offroad") return 0;
  const stride = activity === "run" ? 0.9 : 0.75;
  if (distanceKmDelta <= 0) return 0;
  return Math.floor((distanceKmDelta * 1000) / stride);
}
