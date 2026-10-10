/** TypeScript-типы — зеркало Pydantic-схем бэкенда (Шаг 4 + ТЗ + Fitness). */

export type UserRole = "user" | "tester" | "admin" | "super_admin";
export type ContentStatus = "draft" | "review" | "published" | "rejected";
export type WaypointType =
  | "water" | "camp" | "hazard" | "viewpoint" | "rest"
  | "waterfall" | "lake" | "peak" | "camping" | "spring" | "recreation";
export type AppMode = "production" | "tester";
export type Difficulty = "Легкий" | "Средний" | "Сложный" | "Экстремальный";
export type ActivityType = "hiking" | "walking" | "bike" | "run" | "offroad";

export const ACTIVITY_META: Record<ActivityType, { emoji: string; label: string }> = {
  hiking: { emoji: "🥾", label: "Хайкинг / Трекинг" },
  walking: { emoji: "🚶", label: "Пешая прогулка" },
  bike: { emoji: "🚴", label: "Велосипед / МТБ" },
  run: { emoji: "🏃", label: "Бег / Трейлраннинг" },
  offroad: { emoji: "🚙", label: "Off-road / Auto" },
};

export interface UserProfile {
  telegram_id: number;
  username: string | null;
  full_name: string | null;
  role: UserRole;
  is_blocked?: boolean;
  total_distance_km: number;
  total_elevation_m: number;
  total_steps: number;
  total_calories: number;
  total_hikes: number;
}

export interface Achievement {
  code_name: string;
  title: string;
  description: string | null;
}

export interface Profile extends UserProfile {
  achievements: Achievement[];
  checkins_count?: number;
  visited_locations?: number;
  my_routes_count?: number;
}

export interface RouteItem {
  id: number;
  author_id: number | null;
  title: string;
  description: string | null;
  activity_type: ActivityType;
  difficulty: string;
  distance_km: number;
  elevation_gain_m: number;
  steps_count: number;
  estimated_time: string | null;
  max_elevation_m: number | null;
  photo_url: string | null;
  status: ContentStatus;
  geojson_points: string | null;
  gpx_wkt: string | null;
  rating?: number | null;
}

export interface TrackPoint {
  lat: number;
  lon: number;
  ele?: number | null;
  t?: number | null;
}

export interface WaypointItem {
  id: number;
  route_id: number | null;
  type: WaypointType;
  latitude: number;
  longitude: number;
  title: string | null;
  description: string | null;
  photo_url: string | null;
  status: ContentStatus;
}

export interface WaypointCreate {
  route_id?: number | null;
  type: WaypointType;
  latitude: number;
  longitude: number;
  title?: string | null;
  description?: string | null;
}

export interface CheckinOut {
  id: number;
  telegram_id: number;
  waypoint_id: number | null;
  route_id: number | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string | null;
}

export interface StepDay {
  date: string;
  steps: number;
  distance_km: number;
  calories: number;
}

export interface StepsStats {
  range: string;
  days: number;
  series: StepDay[];
  totals: { steps: number; distance_km: number; calories: number };
  today: { steps: number; distance_km: number; calories: number };
  lifetime: { steps: number; distance_km: number; calories: number; hikes: number };
}

export interface AdminUser {
  telegram_id: number;
  username: string | null;
  full_name: string | null;
  role: UserRole;
  is_blocked: boolean;
  total_distance_km: number;
  total_elevation_m: number;
}

export interface AdminStats {
  total_users: number;
  active_users: number;
  blocked_users: number;
  by_role: Record<string, number>;
  total_checkins: number;
  total_routes: number;
  total_waypoints: number;
  published_waypoints: number;
  draft_waypoints: number;
  total_tickets_open: number;
}

export interface TicketOut {
  id: number;
  telegram_id: number | null;
  kind: string;
  subject: string | null;
  message: string;
  status: string;
}

export type Tab = "home" | "map" | "routes" | "track" | "profile" | "admin";
