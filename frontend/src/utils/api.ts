/** HTTP-клиент к FastAPI (Шаг 4). Auth Шага 3: заголовок X-Telegram-Id. */

import type {
  AppMode,
  Profile,
  RouteItem,
  UserProfile,
  WaypointCreate,
  WaypointItem,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function req<T>(
  path: string,
  telegramId: number | null,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(telegramId != null ? { "X-Telegram-Id": String(telegramId) } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`API ${res.status} ${path}: ${detail}`);
  }
  return (await res.json()) as T;
}

export function authInitData(initData: string): Promise<UserProfile> {
  return req<UserProfile>("/api/auth/init-data", null, {
    method: "POST",
    body: JSON.stringify({ initData }),
  });
}

/** Локальный вход: создаёт тестового пользователя, если его нет в БД. */
export function devLogin(telegramId: number): Promise<UserProfile> {
  return req<UserProfile>("/api/auth/dev-login", null, {
    method: "POST",
    body: JSON.stringify({ telegram_id: telegramId }),
  });
}

export function getProfile(telegramId: number): Promise<Profile> {
  return req<Profile>("/api/users/profile", telegramId);
}

export function getRoutes(telegramId: number | null): Promise<RouteItem[]> {
  return req<RouteItem[]>("/api/routes", telegramId);
}

export function getWaypoints(
  telegramId: number,
  mode: AppMode,
  routeId?: number | null,
): Promise<WaypointItem[]> {
  const q = new URLSearchParams({ mode });
  if (routeId != null) q.set("route_id", String(routeId));
  return req<WaypointItem[]>(`/api/waypoints?${q.toString()}`, telegramId);
}

export function createWaypoint(
  telegramId: number,
  payload: WaypointCreate,
): Promise<WaypointItem> {
  return req<WaypointItem>("/api/waypoints", telegramId, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
