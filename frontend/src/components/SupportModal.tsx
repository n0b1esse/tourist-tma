"use client";

import { useState } from "react";

import type { UserRole } from "@/types";
import { sendBugReport, sendFeedback } from "@/utils/api";

/** Форма поддержки / баг-репорта (ТЗ §2, §5А). */
export default function SupportModal({
  telegramId,
  role,
  onClose,
}: {
  telegramId: number;
  role: UserRole | null;
  onClose: () => void;
}) {
  const canBug = role === "tester" || role === "admin" || role === "super_admin";
  const [kind, setKind] = useState<"feedback" | "bug">("feedback");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!message.trim()) {
      setError("Напиши текст сообщения");
      return;
    }
    setSending(true);
    setError(null);
    try {
      if (kind === "bug") {
        await sendBugReport(telegramId, { subject: subject.trim() || null, message: message.trim() });
        setResult("🐞 Баг-репорт отправлен супер-админу!");
      } else {
        await sendFeedback(telegramId, { subject: subject.trim() || null, message: message.trim() });
        setResult("✅ Сообщение отправлено администраторам!");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40">
      <div className="w-full max-w-md rounded-t-3xl bg-[var(--tma-bg)] p-4 pb-[env(safe-area-inset-bottom)]">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-h2">🆘 Поддержка</h2>
          <button onClick={onClose} className="px-2 py-1 text-h2 text-[var(--tma-hint)]">✕</button>
        </div>
        {result ? (
          <>
            <p className="text-body">{result}</p>
            <button onClick={onClose} className="mt-3 w-full rounded-xl bg-primary py-2.5 font-semibold text-white">
              Закрыть
            </button>
          </>
        ) : (
          <>
            <div className="mb-2 flex gap-2">
              <button
                onClick={() => setKind("feedback")}
                className={`flex-1 rounded-xl py-2 text-body font-semibold ${kind === "feedback" ? "bg-primary text-white" : "bg-[var(--tma-secondary-bg)]"}`}
              >
                💬 Вопрос
              </button>
              {canBug && (
                <button
                  onClick={() => setKind("bug")}
                  className={`flex-1 rounded-xl py-2 text-body font-semibold ${kind === "bug" ? "bg-draft text-white" : "bg-[var(--tma-secondary-bg)]"}`}
                >
                  🐞 Баг-репорт
                </button>
              )}
            </div>
            <input
              className="mb-2 w-full rounded-xl bg-[var(--tma-secondary-bg)] p-2.5 text-body"
              placeholder="Тема (необязательно)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <textarea
              className="mb-2 w-full rounded-xl bg-[var(--tma-secondary-bg)] p-2.5 text-body"
              placeholder={kind === "bug" ? "Что сломалось? Где? Шаги..." : "Чем помочь?"}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            {error && <p className="mb-2 text-body text-accent">{error}</p>}
            <button
              disabled={sending}
              onClick={submit}
              className="w-full rounded-xl bg-primary py-2.5 font-semibold text-white disabled:opacity-50"
            >
              {sending ? "Отправка…" : "Отправить"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
