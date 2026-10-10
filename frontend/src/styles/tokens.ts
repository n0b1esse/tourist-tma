/** Дизайн-токены из §6 спецификации — единый источник для TS-кода. */
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
  /** Эмодзи-метки типов точек */
  typeEmoji: {
    water: "💧",
    camp: "⛺",
    hazard: "⚠️",
    viewpoint: "📸",
    rest: "🌿",
  } as Record<string, string>,
  typeLabel: {
    water: "Вода",
    camp: "Привал / лагерь",
    hazard: "Опасность",
    viewpoint: "Видовая точка",
    rest: "Отдых",
  } as Record<string, string>,
  routeLine: "#2D6A4F",
} as const;
