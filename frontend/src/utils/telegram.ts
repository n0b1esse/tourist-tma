/** Хелперы Telegram WebApp (Шаг 4 + ТЗ §1, §4В). Вне Telegram возвращают заглушки. */

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  colorScheme?: "light" | "dark";
  onEvent?: (event: string, cb: () => void) => void;
  offEvent?: (event: string, cb: () => void) => void;
  HapticFeedback?: { impactOccurred: (style: string) => void };
}

export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram;
  return tg?.WebApp ?? null;
}

/** Сырая строка initData для POST /api/auth/init-data ("" вне Telegram). */
export function getInitData(): string {
  return getWebApp()?.initData ?? "";
}

/** Сообщаем Telegram, что Mini App готов (ready + expand). */
export function notifyReady(): void {
  try {
    const app = getWebApp();
    app?.ready();
    app?.expand?.();
  } catch {
    /* вне Telegram — игнорируем */
  }
}

export function isInsideTelegram(): boolean {
  return getWebApp() !== null;
}

/** Текущая тема Telegram (ТЗ §4В: синхронизация светлой/тёмной темы). */
export function getColorScheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  const tg = getWebApp();
  if (tg?.colorScheme) return tg.colorScheme;
  if (typeof window.matchMedia !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/** Подписка на смену темы Telegram → пересчёт CSS-переменных. */
export function onThemeChanged(cb: () => void): () => void {
  const app = getWebApp();
  try {
    app?.onEvent?.("themeChanged", cb);
  } catch {
    /* ignore */
  }
  const mq = typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  const mqCb = () => cb();
  try {
    mq?.addEventListener?.("change", mqCb);
  } catch {
    /* ignore */
  }
  return () => {
    try {
      app?.offEvent?.("themeChanged", cb);
    } catch {
      /* ignore */
    }
    try {
      mq?.removeEventListener?.("change", mqCb);
    } catch {
      /* ignore */
    }
  };
}

/** Haptic feedback при чек-ине (best-effort). */
export function hapticImpact(style: "light" | "medium" | "heavy" = "medium"): void {
  try {
    getWebApp()?.HapticFeedback?.impactOccurred(style);
  } catch {
    /* ignore */
  }
}

export interface GeoResult {
  lat: number;
  lon: number;
  granted: boolean;
  cached?: boolean;
}

const GEO_CACHE_KEY = "tma-geo-cache";
const GEO_CACHE_TTL_MS = 15 * 60 * 1000; // 15 минут — не дёргаем системный промпт при каждом открытии

interface GeoCache {
  lat: number;
  lon: number;
  granted: boolean;
  ts: number;
}

/** Последний известный статус геолокации (без системного запроса). */
export function getCachedGeo(): GeoResult | null {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as GeoCache;
    if (typeof c.lat !== "number" || typeof c.lon !== "number") return null;
    return { lat: c.lat, lon: c.lon, granted: c.granted, cached: true };
  } catch {
    return null;
  }
}

export function saveGeoCache(g: GeoResult): void {
  try {
    const payload: GeoCache = { lat: g.lat, lon: g.lon, granted: g.granted, ts: Date.now() };
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function isGeoCacheFresh(): boolean {
  try {
    const raw = localStorage.getItem(GEO_CACHE_KEY);
    if (!raw) return false;
    const c = JSON.parse(raw) as GeoCache;
    return Date.now() - c.ts < GEO_CACHE_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Ждём позднюю подгрузку telegram-web-app.js (до ~3 c).
 * На первом рендере getInitData() часто "" даже внутри Telegram —
 * без ожидания приложение ошибочно уходило на экран dev-входа.
 */
export function waitForInitData(timeoutMs = 3000): Promise<string> {
  const existing = getInitData();
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const v = getInitData();
      if (v || Date.now() - started >= timeoutMs) {
        resolve(v);
        return;
      }
      setTimeout(tick, 150);
    };
    tick();
  });
}

/**
 * Запрос геолокации при старте (ТЗ §1 + кэширование).
 * - Свежий кэш (<15 мин) возвращается СРАЗУ без системного промпта.
 * - Иначе — один getCurrentPosition, результат сохраняется в localStorage.
 * При отказе/ошибке — granted=false (карта центрируется на Бишкеке).
 */
export function requestGeolocation(timeoutMs = 8000, opts?: { forceRefresh?: boolean }): Promise<GeoResult> {
  if (!opts?.forceRefresh) {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(GEO_CACHE_KEY) : null;
      if (raw) {
        const c = JSON.parse(raw) as GeoCache;
        if (typeof c.lat === "number" && typeof c.lon === "number" && Date.now() - c.ts < GEO_CACHE_TTL_MS) {
          return Promise.resolve({ lat: c.lat, lon: c.lon, granted: c.granted, cached: true });
        }
      }
    } catch {
      /* ignore */
    }
  }
  return new Promise((resolve) => {
    const fallback: GeoResult = { lat: 42.8746, lon: 74.5698, granted: false };
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      saveGeoCache(fallback);
      resolve(fallback);
      return;
    }
    let done = false;
    const finish = (g: GeoResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      saveGeoCache(g);
      resolve(g);
    };
    const timer = setTimeout(() => finish({ ...fallback, cached: false }), timeoutMs);
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => finish({ lat: pos.coords.latitude, lon: pos.coords.longitude, granted: true }),
        () => finish(fallback),
        { enableHighAccuracy: true, timeout: Math.max(1000, timeoutMs - 500), maximumAge: 60000 },
      );
    } catch {
      finish(fallback);
    }
  });
}

/** Тихое фоновое обновление координат (не блокирует UI, не шумит при отказе). */
export function refreshGeoInBackground(): void {
  try {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => saveGeoCache({ lat: pos.coords.latitude, lon: pos.coords.longitude, granted: true }),
      () => undefined,
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  } catch {
    /* ignore */
  }
}

/** Расстояние в метрах (haversine) — для кнопки «Чек-ин» в радиусе. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
