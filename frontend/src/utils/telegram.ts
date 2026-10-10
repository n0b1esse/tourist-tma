/** Хелперы Telegram WebApp (Шаг 4). Вне Telegram возвращают заглушки. */

interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
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
  } catch {
    /* вне Telegram — игнорируем */
  }
}

export function isInsideTelegram(): boolean {
  return getWebApp() !== null;
}
