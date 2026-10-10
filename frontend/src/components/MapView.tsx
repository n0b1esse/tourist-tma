"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { RouteItem, WaypointItem } from "@/types";
import { tokens } from "@/styles/tokens";
import { parseWktLines } from "@/utils/wkt";

const DEFAULT_CENTER: [number, number] = [56.83, 60.6];

/**
 * Интерактивная карта (Шаг 5).
 * - Линии маршрутов — GPX из gpx_wkt (зелёные, §6 primary).
 * - Маркеры: published — зелёные, draft — жёлтые, review — оранжевые.
 * - В tester-режиме клик по карте отдаёт координаты наружу (создание точки).
 */
export default function MapView({
  routes,
  waypoints,
  testerMode,
  selectedRouteId,
  onMapClick,
}: {
  routes: RouteItem[];
  waypoints: WaypointItem[];
  testerMode: boolean;
  selectedRouteId: number | null;
  onMapClick: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  // Инициализация карты — один раз
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView(DEFAULT_CENTER, 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

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

    for (const w of waypoints) {
      const emoji = tokens.typeEmoji[w.type] ?? "📍";
      const icon = L.divIcon({
        className: "",
        html: `<div class="tma-marker tma-marker-${w.status}">${emoji}</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -14],
      });
      L.marker([w.latitude, w.longitude], { icon })
        .bindPopup(
          `<b>${escapeHtml(w.title ?? tokens.typeLabel[w.type] ?? w.type)}</b><br>` +
            `${tokens.typeLabel[w.type] ?? w.type} · ${w.status}`,
        )
        .addTo(overlay);
    }

    // Первичный фит по всем данным; дальше — только по выбору маршрута
    if (!fittedRef.current && allBounds.length > 0) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [24, 24] });
      fittedRef.current = true;
    }
  }, [routes, waypoints, selectedRouteId]);

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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
