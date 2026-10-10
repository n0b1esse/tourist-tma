/** TypeScript-типы — зеркало Pydantic-схем бэкенда (Шаг 4). */

export type UserRole = "user" | "tester" | "admin";
export type ContentStatus = "draft" | "review" | "published" | "rejected";
export type WaypointType = "water" | "camp" | "hazard" | "viewpoint" | "rest";
export type AppMode = "production" | "tester";

export interface UserProfile {
  telegram_id: number;
  username: string | null;
  full_name: string | null;
  role: UserRole;
  total_distance_km: number;
  total_elevation_m: number;
}

export interface Achievement {
  code_name: string;
  title: string;
  description: string | null;
}

export interface Profile extends UserProfile {
  achievements: Achievement[];
}

export interface RouteItem {
  id: number;
  title: string;
  description: string | null;
  difficulty: string;
  distance_km: number;
  elevation_gain_m: number;
  estimated_time: string | null;
  max_elevation_m: number | null;
  gpx_wkt: string | null;
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

export type Tab = "map" | "routes" | "profile";
