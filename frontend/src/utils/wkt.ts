/** Мини-парсер WKT для GPX-линий бэкенда (Шаг 5).
 * Поддерживает MULTILINESTRING(((lon lat,...)),((...))) и LINESTRING(...).
 * Возвращает линии как массивы [lat, lng] для Leaflet.
 */

export type LatLng = [number, number];

export function parseWktLines(wkt: string | null): LatLng[][] {
  if (!wkt) return [];
  const body = wkt.trim();
  const match = body.match(/^(MULTILINESTRING|LINESTRING)\s*\(\s*([\s\S]*)\s*\)$/i);
  if (!match) return [];
  const [, kind, inner] = match;
  const groups = kind === "MULTILINESTRING" ? splitGroups(inner) : [inner];
  return groups
    .map((g) =>
      g
        .split(",")
        .map((pt) => {
          const nums = pt.trim().split(/\s+/).map(Number);
          if (nums.length < 2 || nums.some(Number.isNaN)) return null;
          return [nums[1], nums[0]] as LatLng; // WKT: lon lat -> Leaflet: lat lng
        })
        .filter((p): p is LatLng => p !== null),
    )
    .filter((line) => line.length > 0);
}

/** Режет "((...)),((...))" по границам групп с учётом вложенных скобок. */
function splitGroups(inner: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "(") {
      depth += 1;
      if (depth > 1) current += ch;
    } else if (ch === ")") {
      depth -= 1;
      if (depth >= 1) current += ch;
      if (depth === 0) {
        groups.push(current);
        current = "";
      }
    } else if (depth >= 1) {
      current += ch;
    }
  }
  if (current.trim()) groups.push(current);
  return groups;
}
