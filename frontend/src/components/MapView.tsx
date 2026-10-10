"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { RouteItem, WaypointItem } from "@/types";
import { tokens } from "@/styles/tokens";
import { parseWktLines } from "@/utils/wkt";

const BISHKEK: [number, number] = [42.8746, 74.5698];

/**
 * Интерактивная карта (ТЗ §1, §4Б).
 * - Старт: GPS пользователя, при отказе — центр Бишкека.
 * - Кастомные иконки по категориям (водопады, озёра, пики, кемпинги, источники, зоны отдыха).
 * - Маркер пользователя + подсветка ближайших точек.
 * - В tester-режиме клик отдаёт координаты наружу (создание точки).
 */
export default function MapView({
  routes,
  waypoints,
  testerMode,
  selectedRouteId,
  userLocation,
  onMapClick,
  onWaypointSelect,
}: {
  routes: RouteItem[];
  waypoints: WaypointItem[];
  testerMode: boolean;
  selectedRouteId: number | null;
  userLocation: { lat: number; lon: number; granted: boolean } | null;
  onMapClick: (lat: number, lng: number) => void;
  onWaypointSelect?: (w: WaypointItem) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const userRef = useRef<L.Marker | null>(null);
  const fittedRef = useRef(false);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const selectRef = useRef(onWaypointSelect);
  selectRef.current = onWaypointSelect;

  // Инициализация карты — один раз, стартовый центр Бишкек
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const start = userLocation ? [userLocation.lat, userLocation.lon] as [number, number] : BISHKEK;
    const map = L.map(containerRef.current).setView(start, userLocation?.granted ? 13 : 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      fittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Центрирование на GPS при первом получении
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation?.granted) return;
    if (!fittedRef.current) {
      map.setView([userLocation.lat, userLocation.lon], 13, { animate: true });
    }
  }, [userLocation]);

  // Клик в tester-режиме
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (e: L.LeafletMouseEvent) => {
      clickRef.current(e.latlng.lat, e.latlng.lng);
    };
    if (testerMode) {
      map.on("click", handler);
      map.getContainer().style.cursor = "crosshair";
    }
    return () => {
      map.off("click", handler);
      map.getContainer().style.cursor = "";
    };
  }, [testerMode]);

  // Перерисовка слоёв при изменении данных
  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;
    overlay.clearLayers();

    const allBounds: L.LatLngExpression[] = [];
    for (const route of routes) {
      const lines = parseWktLines(route.gpx_wkt);
      for (const line of lines) {
        L.polyline(line, {
          color: tokens.routeLine,
          weight: route.id === selectedRouteId ? 6 : 4,
          opacity: route.id === selectedRouteId ? 1 : 0.75,
        })
          .bindTooltip(route.title)
          .addTo(overlay);
        allBounds.push(...line);
      }
    }

    // Ближайшие точки при известном GPS — подсвечиваем кольцом
    const nearIds = new Set<number>();
    if (userLocation?.granted) {
      const ranked = [...waypoints]
        .map((w) => ({ w, d: haversine(userLocation.lat, userLocation.lon, w.latitude, w.longitude) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, 5);
      for (const r of ranked) nearIds.add(r.w.id);
    }

    for (const w of waypoints) {
      const emoji = tokens.typeEmoji[w.type] ?? "📍";
      const border = (tokens.typeColor as Record<string, string>)[w.type] ?? tokens.statusColor[w.status] ?? "#2D6A4F";
      const ring = nearIds.has(w.id) ? "box-shadow:0 0 0 3px #2D6A4F, 0 1px 4px rgba(0,0,0,.35);" : "box-shadow:0 1px 4px rgba(0,0,0,.35);";
      const icon = L.divIcon({
        className: "",
        html: `<div class="tma-marker tma-marker-${w.status}" style="background:${border};${ring}">${emoji}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -14],
      });
      const marker = L.marker([w.latitude, w.longitude], { icon });
      const label = (tokens.typeLabel as Record<string, string>)[w.type] ?? w.type;
      marker.bindPopup(
        `<b>${escapeHtml(w.title ?? label)}</b><br>` + `${escapeHtml(label)} · ${escapeHtml(w.status)}`,
      );
      marker.on("click", () => selectRef.current?.(w));
      marker.addTo(overlay);
    }

    // Первичный фит по всем данным (если GPS нет); дальше — только по выбору маршрута
    if (!fittedRef.current && allBounds.length > 0 && !userLocation?.granted) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [24, 24] });
      fittedRef.current = true;
    } else if (userLocation?.granted && !fittedRef.current && allBounds.length === 0) {
      fittedRef.current = true;
    }
  }, [routes, waypoints, selectedRouteId, userLocation]);

  // Маркер пользователя
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;
    if (userRef.current) {
      userRef.current.setLatLng([userLocation.lat, userLocation.lon]);
      return;
    }
    const icon = L.divIcon({
      className: "",
      html: `<div class="tma-user-marker">🧭</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
    });
    userRef.current = L.marker([userLocation.lat, userLocation.lon], { icon, zIndexOffset: 1000 })
      .bindPopup(userLocation.granted ? "Ты здесь" : "Бишкек (GPS недоступен)")
      .addTo(map);
  }, [userLocation]);

  // Фит по выбранному маршруту
  useEffect(() => {
    const map = mapRef.current;
    if (!map || selectedRouteId == null) return;
    const route = routes.find((r) => r.id === selectedRouteId);
    if (!route) return;
    const lines = parseWktLines(route.gpx_wkt);
    const pts = lines.flat();
    if (pts.length > 0) map.fitBounds(L.latLngBounds(pts), { padding: [32, 32] });
  }, [selectedRouteId, routes]);

  return <div ref={containerRef} className="h-full min-h-[420px] w-full rounded-2xl" />;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
