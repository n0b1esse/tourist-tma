/** Дизайн-токены из §6 спецификации — единый источник для TS-кода (ТЗ §4Б). */
export const tokens = {
  colors: {
    primary: "#2D6A4F",
    accent: "#E07A5F",
    draft: "#F4A261",
    success: "#52B788",
  },
  /** Цвет маркера по статусу точки */
  statusColor: {
    published: "#52B788",
    draft: "#F4A261",
    review: "#E07A5F",
    rejected: "#9E9E9E",
  } as Record<string, string>,
  /** Эмодзи-метки типов точек (ТЗ §4Б: категории) */
  typeEmoji: {
    water: "💧",
    camp: "⛺",
    hazard: "⚠️",
    viewpoint: "📸",
    rest: "🌿",
    waterfall: "🌊",
    lake: "🏞️",
    peak: "🏔️",
    camping: "🏕️",
    spring: "💦",
    recreation: "🧘",
  } as Record<string, string>,
  typeLabel: {
    water: "Вода",
    camp: "Привал / лагерь",
    hazard: "Опасность",
    viewpoint: "Видовая точка",
    rest: "Отдых",
    waterfall: "Водопад",
    lake: "Озеро",
    peak: "Пик",
    camping: "Кемпинг",
    spring: "Источник",
    recreation: "Зона отдыха",
  } as Record<string, string>,
  /** Цвет обводки маркера по категории */
  typeColor: {
    water: "#2196F3",
    waterfall: "#00BCD4",
    lake: "#03A9F4",
    spring: "#4FC3F7",
    peak: "#9C27B0",
    viewpoint: "#FF9800",
    camp: "#795548",
    camping: "#8D6E63",
    rest: "#4CAF50",
    recreation: "#66BB6A",
    hazard: "#F44336",
  } as Record<string, string>,
  routeLine: "#2D6A4F",
  /** Центр Бишкека — фолбэк при отказе GPS (ТЗ §1) */
  bishkekCenter: [42.8746, 74.5698] as [number, number],
} as const;
