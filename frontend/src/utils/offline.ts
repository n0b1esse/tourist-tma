/** Офлайн-устойчивость Mini App: мок-профиль, кэш профиля и данных.
 *
 * Зачем: если бэкенд недоступен, приложение НЕ должно висеть на «Загрузке…».
 * Вместо этого — экран ошибки с кнопками «Повторить», «Продолжить с кэшем»
 * и «Гостевой режим» (мок-профиль, карта и трекер работают локально).
 */

import type { Profile, RouteItem, WaypointItem } from "@/types";

const PROFILE_CACHE_KEY = "tma-profile-cache";
const DATA_CACHE_KEY = "tma-data-cache";

/** Тестовый мок-профиль для входа вне Telegram и гостевого режима. */
export function makeGuestProfile(): Profile {
  return {
    telegram_id: 0,
    username: "guest",
    full_name: "Гость",
    role: "user",
    is_blocked: false,
    total_distance_km: 0,
    total_elevation_m: 0,
    total_steps: 0,
    total_calories: 0,
    total_hikes: 0,
    achievements: [],
    checkins_count: 0,
    visited_locations: 0,
    my_routes_count: 0,
  };
}

export function isGuestId(id: number | null): boolean {
  return id == null || id === 0;
}

export function saveProfileCache(p: Profile): void {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ ts: Date.now(), profile: p }));
  } catch {
    /* ignore */
  }
}

export function loadProfileCache(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { profile: Profile };
    if (!parsed?.profile || typeof parsed.profile.telegram_id !== "number") return null;
    return parsed.profile;
  } catch {
    return null;
  }
}

export interface DataCache {
  routes: RouteItem[];
  waypoints: WaypointItem[];
  myRoutes: RouteItem[];
}

export function saveDataCache(d: DataCache): void {
  try {
    localStorage.setItem(DATA_CACHE_KEY, JSON.stringify({ ts: Date.now(), ...d }));
  } catch {
    /* ignore */
  }
}

export function loadDataCache(): DataCache | null {
  try {
    const raw = localStorage.getItem(DATA_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DataCache>;
    return {
      routes: Array.isArray(parsed.routes) ? parsed.routes : [],
      waypoints: Array.isArray(parsed.waypoints) ? parsed.waypoints : [],
      myRoutes: Array.isArray(parsed.myRoutes) ? parsed.myRoutes : [],
    };
  } catch {
    return null;
  }
}
