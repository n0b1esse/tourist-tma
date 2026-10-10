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
}

/**
 * Запрос геолокации при старте (ТЗ §1).
 * При согласии — координаты пользователя; при отказе/ошибке — granted=false
 * (карта центрируется на Бишкеке).
 */
export function requestGeolocation(timeoutMs = 8000): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ lat: 42.8746, lon: 74.5698, granted: false });
      return;
    }
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ lat: 42.8746, lon: 74.5698, granted: false });
      }
    }, timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, granted: true });
      },
      () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ lat: 42.8746, lon: 74.5698, granted: false });
      },
      { enableHighAccuracy: true, timeout: timeoutMs - 500, maximumAge: 60000 },
    );
  });
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
