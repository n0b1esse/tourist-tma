"use client";

import { useState } from "react";

const STEPS = [
  { icon: "🗺️", title: "Карта", text: "Здесь точки и маршруты. Зелёные — проверенные, жёлтые — черновики тестеров." },
  { icon: "📍", title: "Чек-ин", text: "Подойди к точке ближе 300 м — появится кнопка «Чек-ин». За него дают бейджи!" },
  { icon: "🥾", title: "Маршруты", text: "Фильтруй хайки по сложности: Легкий → Экстремальный, по длине и рейтингу." },
  { icon: "👤", title: "Профиль", text: "Километраж, набор высоты, бейджи: «Первый хайк», «Покоритель 3000м», «Легенда Бишкека»." },
  { icon: "🧪", title: "Роли", text: "Тестеры шлют баг-репорты, гиды создают маршруты, супер-админ модерирует всё." },
];

const KEY = "tma-onboarding-done-v1";

/** Интерактивный онбординг при первом входе (ТЗ §4А). */
export function shouldShowOnboarding(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) !== "1";
  } catch {
    return false;
  }
}

export function markOnboardingDone(): void {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* ignore */
  }
}

export default function OnboardingTour({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  const finish = () => {
    markOnboardingDone();
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-6">
      <div className="w-full max-w-sm rounded-3xl bg-[var(--tma-bg)] p-5 text-center">
        <div className="text-5xl">{s.icon}</div>
        <div className="mt-2 text-h1">
          {s.title} · {step + 1}/{STEPS.length}
        </div>
        <p className="mt-2 text-body text-[var(--tma-hint)]">{s.text}</p>
        <div className="mt-3 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 w-6 rounded-full ${i === step ? "bg-primary" : "bg-black/15"}`}
            />
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          {!last ? (
            <>
              <button
                onClick={finish}
                className="flex-1 rounded-xl bg-[var(--tma-secondary-bg)] py-2.5 font-semibold"
              >
                Пропустить
              </button>
              <button
                onClick={() => setStep(step + 1)}
                className="flex-1 rounded-xl bg-primary py-2.5 font-semibold text-white"
              >
                Далее →
              </button>
            </>
          ) : (
            <button
              onClick={finish}
              className="w-full rounded-xl bg-primary py-2.5 font-semibold text-white"
            >
              Погнали! 🥾
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
