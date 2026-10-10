/** HTTP-клиент к FastAPI (Шаг 4 + ТЗ: admin/checkins/tickets). Auth: X-Telegram-Id. */

import type {
  ActivityType,
  AdminStats,
  AdminUser,
  AppMode,
  CheckinOut,
  Profile,
  RouteItem,
  StepsStats,
  TicketOut,
  TrackPoint,
  UserProfile,
  UserRole,
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
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
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

export function getRoutes(
  telegramId: number | null,
  filters?: { difficulty?: string | null; max_distance_km?: number | null; activity_type?: ActivityType | null; status?: string | null },
): Promise<RouteItem[]> {
  const q = new URLSearchParams();
  if (filters?.difficulty) q.set("difficulty", filters.difficulty);
  if (filters?.max_distance_km != null) q.set("max_distance_km", String(filters.max_distance_km));
  if (filters?.activity_type) q.set("activity_type", filters.activity_type);
  if (filters?.status) q.set("status", filters.status);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return req<RouteItem[]>(`/api/routes${suffix}`, telegramId);
}

export function getMyRoutes(telegramId: number): Promise<RouteItem[]> {
  return req<RouteItem[]>("/api/routes/mine", telegramId);
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

export function updateWaypoint(
  telegramId: number,
  id: number,
  payload: Partial<WaypointCreate> & { title?: string | null; description?: string | null },
): Promise<WaypointItem> {
  return req<WaypointItem>(`/api/waypoints/${id}`, telegramId, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteWaypoint(telegramId: number, id: number): Promise<void> {
  return req<void>(`/api/waypoints/${id}`, telegramId, { method: "DELETE" });
}

export function moderateWaypoint(
  telegramId: number,
  id: number,
  status: "published" | "rejected",
): Promise<WaypointItem> {
  return req<WaypointItem>(`/api/waypoints/${id}/moderate`, telegramId, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function createRoute(
  telegramId: number,
  payload: { title: string; description?: string | null; activity_type?: ActivityType; difficulty: string; distance_km: number; elevation_gain_m: number; steps_count?: number; estimated_time?: string | null; max_elevation_m?: number | null; photo_url?: string | null; track_points?: TrackPoint[] },
): Promise<RouteItem> {
  return req<RouteItem>("/api/routes", telegramId, { method: "POST", body: JSON.stringify(payload) });
}

export interface RecordResult {
  route: RouteItem;
  awarded: string[];
  calories: number;
}

export function recordTrack(
  telegramId: number,
  payload: { title: string; description?: string | null; activity_type: ActivityType; difficulty: string; track_points: TrackPoint[]; steps_count: number; photo_url?: string | null; estimated_time?: string | null },
): Promise<RecordResult> {
  return req<RecordResult>("/api/routes/record", telegramId, { method: "POST", body: JSON.stringify(payload) });
}

export function proposeRoute(telegramId: number, id: number): Promise<RouteItem> {
  return req<RouteItem>(`/api/routes/${id}/propose`, telegramId, { method: "POST" });
}

export function moderateRoute(telegramId: number, id: number, status: "published" | "rejected"): Promise<RouteItem> {
  return req<RouteItem>(`/api/routes/${id}/moderate`, telegramId, { method: "PATCH", body: JSON.stringify({ status }) });
}

export function importTrack(
  telegramId: number,
  payload: { content: string; format: "gpx" | "kml" },
): Promise<{ points: TrackPoint[]; distance_km: number; elevation_gain_m: number; max_elevation_m: number | null }> {
  return req("/api/routes/import", telegramId, { method: "POST", body: JSON.stringify(payload) });
}

export async function exportTrackUrl(telegramId: number, id: number, format: "gpx" | "kml" | "geojson"): Promise<string> {
  const API_URL_INNER = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${API_URL_INNER}/api/routes/${id}/export?format=${format}`, {
    headers: telegramId != null ? { "X-Telegram-Id": String(telegramId) } : {},
  });
  if (!res.ok) throw new Error(`Export ${res.status}`);
  return await res.text();
}

// --- Шагомер (Fitness) ---
export interface CheckinResult {
  checkin: CheckinOut;
  awarded: string[];
}

export function createCheckin(
  telegramId: number,
  payload: { waypoint_id?: number | null; route_id?: number | null; latitude?: number | null; longitude?: number | null },
): Promise<CheckinResult> {
  return req<CheckinResult>("/api/checkins", telegramId, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function myCheckins(telegramId: number): Promise<CheckinOut[]> {
  return req<CheckinOut[]>("/api/checkins/my", telegramId);
}

// --- Тикеты / поддержка (ТЗ §2, §5А) ---
export function sendFeedback(
  telegramId: number,
  payload: { subject?: string | null; message: string },
): Promise<TicketOut> {
  return req<TicketOut>("/api/tickets/feedback", telegramId, {
    method: "POST",
    body: JSON.stringify({ kind: "feedback", ...payload }),
  });
}

export function sendBugReport(
  telegramId: number,
  payload: { subject?: string | null; message: string },
): Promise<TicketOut> {
  return req<TicketOut>("/api/tickets/bug", telegramId, {
    method: "POST",
    body: JSON.stringify({ kind: "bug", ...payload }),
  });
}

// --- Админка (ТЗ §3, только super_admin) ---
export interface AdminUserList {
  items: AdminUser[];
  total: number;
  page: number;
  page_size: number;
}

export function adminListUsers(
  telegramId: number,
  params: { page?: number; page_size?: number; role?: string | null; q?: string | null },
): Promise<AdminUserList> {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.page_size) q.set("page_size", String(params.page_size));
  if (params.role) q.set("role", params.role);
  if (params.q) q.set("q", params.q);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return req<AdminUserList>(`/api/admin/users${suffix}`, telegramId);
}

export function adminSetRole(telegramId: number, targetId: number, role: UserRole): Promise<AdminUser> {
  return req<AdminUser>(`/api/admin/users/${targetId}/role`, telegramId, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function adminSetBlocked(telegramId: number, targetId: number, is_blocked: boolean): Promise<AdminUser> {
  return req<AdminUser>(`/api/admin/users/${targetId}/status`, telegramId, {
    method: "PATCH",
    body: JSON.stringify({ is_blocked }),
  });
}

export function adminStats(telegramId: number): Promise<AdminStats> {
  return req<AdminStats>("/api/admin/stats", telegramId);
}

export function adminNotify(
  telegramId: number,
  payload: { text: string; role_filter?: UserRole | null },
): Promise<{ total: number; sent: number; failed: number }> {
  return req(`/api/admin/notifications`, telegramId, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminListTickets(telegramId: number): Promise<TicketOut[]> {
  return req<TicketOut[]>("/api/admin/tickets", telegramId);
}

export function adminToggleTicket(telegramId: number, id: number): Promise<TicketOut> {
  return req<TicketOut>(`/api/admin/tickets/${id}`, telegramId, { method: "PATCH" });
}

// --- Шагомер: логи и статистика ---
export interface StepLogResult {
  log: { log_date: string; steps: number; distance_km: number; calories: number };
  awarded: string[];
  total_steps: number;
}

export function logSteps(
  telegramId: number,
  payload: { steps: number; distance_km?: number; calories?: number },
): Promise<StepLogResult> {
  return req<StepLogResult>("/api/steps/log", telegramId, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getStepsStats(telegramId: number, range: "today" | "week" | "month" = "week"): Promise<StepsStats> {
  return req<StepsStats>(`/api/steps/stats?range=${range}`, telegramId);
}
