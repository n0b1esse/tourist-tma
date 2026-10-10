/** Гео-математика трекера: дистанция, набор высоты, калории, шаги, GPX/KML. */

import type { TrackPoint } from "@/types";

export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface TrackStats {
  distanceKm: number;
  elevationGainM: number;
  maxElevationM: number | null;
  durationSec: number;
  avgSpeedKmh: number;
  currentSpeedKmh: number;
}

export function calcTrackStats(points: TrackPoint[]): TrackStats {
  let distM = 0;
  let gain = 0;
  let maxEle: number | null = null;
  let prevEle: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (typeof p.ele === "number" && !Number.isNaN(p.ele)) {
      maxEle = maxEle == null ? p.ele : Math.max(maxEle, p.ele);
      if (prevEle != null && p.ele > prevEle) gain += Math.round(p.ele - prevEle);
      prevEle = p.ele;
    }
    if (i > 0) {
      const a = points[i - 1];
      distM += haversineM(a.lat, a.lon, p.lat, p.lon);
    }
  }
  const t0 = points[0]?.t ?? null;
  const t1 = points.length > 0 ? points[points.length - 1].t ?? null : null;
  const durationSec = t0 != null && t1 != null ? Math.max(0, Math.round((t1 - t0) / 1000)) : 0;
  const distanceKm = distM / 1000;
  const avgSpeedKmh = durationSec > 0 ? distanceKm / (durationSec / 3600) : 0;
  // Текущая скорость — по последним двум точкам (если свежие, <60 c)
  let currentSpeedKmh = 0;
  if (points.length >= 2) {
    const a = points[points.length - 2];
    const b = points[points.length - 1];
    if (a.t != null && b.t != null && b.t - a.t > 0 && b.t - a.t < 60000) {
      const d = haversineM(a.lat, a.lon, b.lat, b.lon);
      currentSpeedKmh = d / ((b.t - a.t) / 1000) * 3.6;
    }
  }
  return {
    distanceKm: Math.round(distanceKm * 1000) / 1000,
    elevationGainM: gain,
    maxElevationM: maxEle != null ? Math.round(maxEle) : null,
    durationSec,
    avgSpeedKmh: Math.round(avgSpeedKmh * 10) / 10,
    currentSpeedKmh: Math.round(currentSpeedKmh * 10) / 10,
  };
}

export function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Фолбэк шагомера: шаги из GPS-дистанции (средняя длина шага 0.75 м, бег 0.9 м). */
export function estimateStepsFromDistance(distanceKm: number, activity = "hiking"): number {
  if (activity === "bike" || activity === "offroad") return 0;
  const stride = activity === "run" ? 0.9 : 0.75;
  if (distanceKm <= 0) return 0;
  return Math.round((distanceKm * 1000) / stride);
}

export function estimateCalories(distanceKm: number, activity = "hiking", weightKg = 70): number {
  const met: Record<string, number> = { hiking: 6, walking: 3.5, bike: 7.5, run: 9.8, offroad: 2.5 };
  const speed: Record<string, number> = { hiking: 4, walking: 4.5, bike: 15, run: 9, offroad: 25 };
  const m = met[activity] ?? 4;
  const v = speed[activity] ?? 4;
  const hours = distanceKm / v;
  return Math.round(m * weightKg * hours * 10) / 10;
}

/** Фильтрация GPS-шума: отбрасываем точки ближе minDistM и с accuracy хуже maxAcc. */
export function filterNoise(
  points: TrackPoint[],
  accuracies: (number | null | undefined)[],
  minDistM = 5,
  maxAccM = 50,
): { points: TrackPoint[]; dropped: number } {
  const out: TrackPoint[] = [];
  let dropped = 0;
  for (let i = 0; i < points.length; i++) {
    const acc = accuracies[i];
    if (acc != null && acc > maxAccM) {
      dropped++;
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && haversineM(prev.lat, prev.lon, points[i].lat, points[i].lon) < minDistM) {
      dropped++;
      continue;
    }
    out.push(points[i]);
  }
  return { points: out, dropped };
}

// --- GPX / KML ---

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildGpx(title: string, points: TrackPoint[]): string {
  const pts = points
    .map(
      (p) =>
        `    <trkpt lat="${p.lat}" lon="${p.lon}">` +
        (typeof p.ele === "number" ? `<ele>${p.ele}</ele>` : "") +
        (p.t != null ? `<time>${new Date(p.t).toISOString()}</time>` : "") +
        "</trkpt>",
    )
    .join("\n");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<gpx version="1.1" creator="tourist-tma" xmlns="http://www.topografix.com/GPX/1/1">\n' +
    `  <trk><name>${escXml(title)}</name><trkseg>\n${pts}\n  </trkseg></trk>\n</gpx>`
  );
}

export function buildKml(title: string, points: TrackPoint[]): string {
  const coords = points.map((p) => `${p.lon},${p.lat},${p.ele ?? 0}`).join(" ");
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<kml xmlns="http://www.opengis.net/kml/2.2">\n' +
    `  <Placemark><name>${escXml(title)}</name><LineString><coordinates>${coords}</coordinates></LineString></Placemark>\n</kml>`
  );
}

export function parseGpxText(content: string): TrackPoint[] {
  const out: TrackPoint[] = [];
  try {
    const doc = new DOMParser().parseFromString(content, "text/xml");
    const nodes = doc.getElementsByTagNameNS("*", "trkpt");
    const src = nodes.length > 0 ? Array.from(nodes) : Array.from(doc.getElementsByTagName("trkpt"));
    for (const el of src as Element[]) {
      const lat = Number(el.getAttribute("lat"));
      const lon = Number(el.getAttribute("lon"));
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      const eleEl = el.getElementsByTagName("ele")[0];
      const ele = eleEl?.textContent ? Number(eleEl.textContent) : null;
      out.push({ lat, lon, ele: ele != null && !Number.isNaN(ele) ? ele : null });
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function parseKmlText(content: string): TrackPoint[] {
  const out: TrackPoint[] = [];
  try {
    const doc = new DOMParser().parseFromString(content, "text/xml");
    const coordsEls = Array.from(doc.getElementsByTagName("coordinates"));
    for (const el of coordsEls) {
      const text = el.textContent ?? "";
      for (const token of text.trim().split(/\s+/)) {
        const parts = token.split(",");
        if (parts.length < 2) continue;
        const lon = Number(parts[0]);
        const lat = Number(parts[1]);
        if (Number.isNaN(lon) || Number.isNaN(lat)) continue;
        const ele = parts.length >= 3 ? Number(parts[2]) : null;
        out.push({ lat, lon, ele: ele != null && !Number.isNaN(ele) ? ele : null });
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}
