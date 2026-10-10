"use client";

import { useCallback, useEffect, useState } from "react";

import type { AdminStats, AdminUser, TicketOut, UserRole } from "@/types";
import {
  adminListTickets,
  adminListUsers,
  adminNotify,
  adminSetBlocked,
  adminSetRole,
  adminStats,
  adminToggleTicket,
} from "@/utils/api";

const ROLES: UserRole[] = ["user", "tester", "admin", "super_admin"];

const roleLabel: Record<string, string> = {
  user: "user",
  tester: "tester 🧪",
  admin: "admin 🛠",
  super_admin: "super 👑",
};

/** Админ-панель супер-админа (ТЗ §3). Видна только super_admin. */
export default function AdminDashboard({ telegramId }: { telegramId: number }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [tickets, setTickets] = useState<TicketOut[]>([]);
  const [notifyText, setNotifyText] = useState("");
  const [notifyRole, setNotifyRole] = useState<string>("");
  const [notifyResult, setNotifyResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, u, t] = await Promise.all([
        adminStats(telegramId),
        adminListUsers(telegramId, {
          page,
          page_size: 20,
          role: roleFilter || null,
          q: appliedQuery || null,
        }),
        adminListTickets(telegramId),
      ]);
      setStats(s);
      setUsers(u.items);
      setTotal(u.total);
      setTickets(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [telegramId, page, roleFilter, appliedQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (target: number, role: UserRole) => {
    setBusyId(target);
    try {
      const updated = await adminSetRole(telegramId, target, role);
      setUsers((prev) => prev.map((u) => (u.telegram_id === target ? updated : u)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const toggleBlock = async (u: AdminUser) => {
    setBusyId(u.telegram_id);
    try {
      const updated = await adminSetBlocked(telegramId, u.telegram_id, !u.is_blocked);
      setUsers((prev) => prev.map((x) => (x.telegram_id === u.telegram_id ? updated : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const sendNotifications = async () => {
    if (!notifyText.trim()) return;
    setNotifyResult(null);
    try {
      const r = await adminNotify(telegramId, {
        text: notifyText.trim(),
        role_filter: (notifyRole || null) as UserRole | null,
      });
      setNotifyResult(`📣 Отправлено ${r.sent}/${r.total} (ошибок: ${r.failed})`);
      setNotifyText("");
    } catch (e) {
      setNotifyResult(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleTicket = async (id: number) => {
    try {
      const updated = await adminToggleTicket(telegramId, id);
      setTickets((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-h1">🛠 Админка</h1>
      {error && <p className="text-body text-accent">{error}</p>}

      {/* Статистика */}
      {stats && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Пользователи" value={stats.total_users} />
          <StatCard label="Активные" value={stats.active_users} />
          <StatCard label="Чек-ины" value={stats.total_checkins} />
          <StatCard label="Маршруты" value={stats.total_routes} />
          <StatCard label="Точек (pub)" value={stats.published_waypoints} />
          <StatCard label="Черновики" value={stats.draft_waypoints} />
          <StatCard label="Заблокированы" value={stats.blocked_users} />
          <StatCard label="Тикетов open" value={stats.total_tickets_open} />
        </div>
      )}
      {stats && (
        <div className="rounded-xl bg-[var(--tma-secondary-bg)] p-3 text-caption">
          По ролям: {Object.entries(stats.by_role).map(([k, v]) => `${k}: ${v}`).join(" · ")}
        </div>
      )}

      {/* Рассылка */}
      <div className="rounded-2xl bg-[var(--tma-secondary-bg)] p-3">
        <div className="mb-2 text-h2">📣 Рассылка</div>
        <textarea
          className="mb-2 w-full rounded-xl bg-[var(--tma-bg)] p-2.5 text-body"
          rows={2}
          placeholder="Текст сервисного уведомления…"
          value={notifyText}
          onChange={(e) => setNotifyText(e.target.value)}
        />
        <div className="flex gap-2">
          <select
            value={notifyRole}
            onChange={(e) => setNotifyRole(e.target.value)}
            className="flex-1 rounded-xl bg-[var(--tma-bg)] p-2 text-body"
          >
            <option value="">Всем</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>Только {r}</option>
            ))}
          </select>
          <button onClick={sendNotifications} className="flex-1 rounded-xl bg-primary py-2 font-semibold text-white">
            Отправить
          </button>
        </div>
        {notifyResult && <p className="mt-2 text-caption">{notifyResult}</p>}
      </div>

      {/* Пользователи */}
      <div>
        <div className="mb-2 text-h2">👥 Пользователи ({total})</div>
        <div className="mb-2 flex gap-2">
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="flex-1 rounded-xl bg-[var(--tma-secondary-bg)] p-2 text-body"
          >
            <option value="">Все роли</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setAppliedQuery(query); setPage(1); } }}
            placeholder="Поиск…"
            className="flex-1 rounded-xl bg-[var(--tma-secondary-bg)] p-2 text-body"
          />
          <button
            onClick={() => { setAppliedQuery(query); setPage(1); }}
            className="rounded-xl bg-[var(--tma-secondary-bg)] px-3 text-body"
          >
            🔍
          </button>
        </div>
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.telegram_id} className="rounded-xl bg-[var(--tma-secondary-bg)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-semibold">
                    {u.full_name ?? u.username ?? u.telegram_id}
                    {u.is_blocked && <span className="ml-1 text-accent">⛔</span>}
                  </div>
                  <div className="text-caption text-[var(--tma-hint)]">
                    @{u.username ?? "—"} · ID {u.telegram_id} · {roleLabel[u.role]}
                  </div>
                </div>
                <button
                  disabled={busyId === u.telegram_id}
                  onClick={() => toggleBlock(u)}
                  className={`shrink-0 rounded-full px-3 py-1 text-caption font-semibold ${
                    u.is_blocked ? "bg-success text-white" : "bg-accent text-white"
                  }`}
                >
                  {u.is_blocked ? "Разблок" : "Блок"}
                </button>
              </div>
              <div className="mt-2 flex gap-1">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    disabled={busyId === u.telegram_id}
                    onClick={() => changeRole(u.telegram_id, r)}
                    className={`flex-1 rounded-lg px-1 py-1 text-caption ${
                      u.role === r ? "bg-primary font-bold text-white" : "bg-[var(--tma-bg)]"
                    }`}
                  >
                    {r === "super_admin" ? "super" : r}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-xl bg-[var(--tma-secondary-bg)] px-4 py-1.5 disabled:opacity-40"
          >
            ←
          </button>
          <span className="text-caption">Стр. {page}</span>
          <button
            disabled={users.length < 20}
            onClick={() => setPage(page + 1)}
            className="rounded-xl bg-[var(--tma-secondary-bg)] px-4 py-1.5 disabled:opacity-40"
          >
            →
          </button>
        </div>
      </div>

      {/* Тикеты */}
      <div>
        <div className="mb-2 text-h2">🎫 Тикеты ({tickets.length})</div>
        <div className="space-y-2">
          {tickets.length === 0 && (
            <p className="text-body text-[var(--tma-hint)]">Открытых обращений нет.</p>
          )}
          {tickets.map((t) => (
            <div key={t.id} className="rounded-xl bg-[var(--tma-secondary-bg)] p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption font-semibold">
                  #{t.id} {t.kind === "bug" ? "🐞 bug" : "💬 feedback"} · {t.status}
                </span>
                <button
                  onClick={() => toggleTicket(t.id)}
                  className="rounded-full bg-[var(--tma-bg)] px-3 py-0.5 text-caption"
                >
                  {t.status === "open" ? "Закрыть" : "Открыть"}
                </button>
              </div>
              {t.subject && <div className="mt-1 font-semibold">{t.subject}</div>}
              <div className="text-body">{t.message}</div>
              <div className="text-caption text-[var(--tma-hint)]">от {t.telegram_id ?? "—"}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-caption text-[var(--tma-hint)]">
        Модерация точек/маршрутов — на вкладке «Карта»: тап по метке открывает редактирование (admin/super_admin).
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-[var(--tma-secondary-bg)] p-3 text-center">
      <div className="text-h1">{value}</div>
      <div className="text-caption text-[var(--tma-hint)]">{label}</div>
    </div>
  );
}
