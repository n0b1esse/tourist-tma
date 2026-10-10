"""Гео-утилиты fitness-трекинга: дистанция, набор высоты, WKT, GPX/KML.

Чистые функции — без БД, покрываются unit-тестами.
"""

from __future__ import annotations

import json
import math
import re
import xml.etree.ElementTree as ET


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def track_stats(points: list[dict]) -> dict:
    """Дистанция (км), набор высоты (м), макс. высота по точкам {lat, lon, ele?}."""
    dist_m = 0.0
    gain = 0
    max_ele: float | None = None
    prev_ele: float | None = None
    for i, p in enumerate(points):
        ele = p.get("ele")
        if isinstance(ele, (int, float)):
            ele = float(ele)
            max_ele = ele if max_ele is None else max(max_ele, ele)
            if prev_ele is not None and ele > prev_ele:
                gain += int(round(ele - prev_ele))
            prev_ele = ele
        if i > 0:
            a, b = points[i - 1], p
            dist_m += haversine_m(a["lat"], a["lon"], b["lat"], b["lon"])
    return {
        "distance_km": round(dist_m / 1000, 3),
        "elevation_gain_m": gain,
        "max_elevation_m": int(round(max_ele)) if max_ele is not None else None,
    }


def points_to_wkt(points: list[dict]) -> str | None:
    """Точки -> MULTILINESTRING(lon lat) для PostGIS. Минимум 2 точки."""
    if len(points) < 2:
        return None
    coords = ", ".join(f"{p['lon']} {p['lat']}" for p in points)
    return f"MULTILINESTRING(({coords}))"


def points_to_geojson(points: list[dict]) -> str:
    coords = [[p["lon"], p["lat"]] + ([p["ele"]] if p.get("ele") is not None else []) for p in points]
    return json.dumps({"type": "LineString", "coordinates": coords}, ensure_ascii=False)


def estimate_steps(distance_km: float, activity: str = "hiking") -> int:
    """Фолбэк шагомера: шаги из GPS-дистанции и средней длины шага."""
    if activity in ("bike", "offroad"):
        return 0
    stride_m = 0.75 if activity in ("hiking", "walking") else 0.9  # run — шире шаг
    if distance_km <= 0:
        return 0
    return int(round(distance_km * 1000 / stride_m))


def estimate_calories(distance_km: float, activity: str = "hiking", weight_kg: float = 70.0) -> float:
    """Грубая оценка ккал: MET-таблица по активности × вес × время (темп по активности)."""
    met = {"hiking": 6.0, "walking": 3.5, "bike": 7.5, "run": 9.8, "offroad": 2.5}.get(activity, 4.0)
    speed_kmh = {"hiking": 4.0, "walking": 4.5, "bike": 15.0, "run": 9.0, "offroad": 25.0}.get(activity, 4.0)
    hours = distance_km / speed_kmh if speed_kmh else 0
    return round(met * weight_kg * hours, 1)


def build_gpx(title: str, points: list[dict]) -> str:
    pts = "\n".join(
        f'    <trkpt lat="{p["lat"]}" lon="{p["lon"]}">'
        + (f"<ele>{p['ele']}</ele>" if p.get("ele") is not None else "")
        + "</trkpt>"
        for p in points
    )
    safe = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<gpx version="1.1" creator="tourist-tma" xmlns="http://www.topografix.com/GPX/1/1">\n'
        f"  <trk><name>{safe}</name><trkseg>\n{pts}\n  </trkseg></trk>\n</gpx>"
    )


def build_kml(title: str, points: list[dict]) -> str:
    coords = " ".join(
        f"{p['lon']},{p['lat']},{p.get('ele') or 0}" for p in points
    )
    safe = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<kml xmlns="http://www.opengis.net/kml/2.2">\n'
        f"  <Placemark><name>{safe}</name><LineString><coordinates>{coords}</coordinates></LineString></Placemark>\n</kml>"
    )


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def parse_gpx(content: str) -> list[dict]:
    """Парсинг GPX -> [{lat, lon, ele?}]. Понимает trkpt/rtept/wpt."""
    root = ET.fromstring(content.encode("utf-8") if isinstance(content, str) else content)
    points: list[dict] = []
    for el in root.iter():
        name = _strip_ns(el.tag)
        if name in ("trkpt", "rtept", "wpt"):
            try:
                lat = float(el.attrib["lat"])
                lon = float(el.attrib["lon"])
            except (KeyError, ValueError):
                continue
            ele: float | None = None
            for child in el:
                if _strip_ns(child.tag) == "ele" and child.text:
                    try:
                        ele = float(child.text.strip())
                    except ValueError:
                        pass
            pt: dict = {"lat": lat, "lon": lon}
            if ele is not None:
                pt["ele"] = ele
            points.append(pt)
    return points


def parse_kml(content: str) -> list[dict]:
    """Парсинг KML -> [{lat, lon, ele?}] из <coordinates>."""
    root = ET.fromstring(content.encode("utf-8") if isinstance(content, str) else content)
    points: list[dict] = []
    for el in root.iter():
        if _strip_ns(el.tag) == "coordinates" and el.text:
            for token in re.split(r"\s+", el.text.strip()):
                if not token:
                    continue
                parts = token.split(",")
                if len(parts) < 2:
                    continue
                try:
                    lon, lat = float(parts[0]), float(parts[1])
                except ValueError:
                    continue
                pt: dict = {"lat": lat, "lon": lon}
                if len(parts) >= 3:
                    try:
                        pt["ele"] = float(parts[2])
                    except ValueError:
                        pass
                points.append(pt)
    return points
