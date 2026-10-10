"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import AddWaypointModal from "@/components/AddWaypointModal";
import AdminDashboard from "@/components/AdminDashboard";
import BottomNavigation from "@/components/BottomNavigation";
import HomePage from "@/components/HomePage";
import ModeSwitcher from "@/components/ModeSwitcher";
import OnboardingTour, { markOnboardingDone, shouldShowOnboarding } from "@/components/OnboardingTour";
import ProfileCard from "@/components/ProfileCard";
import RouteCard from "@/components/RouteCard";
import SupportModal from "@/components/SupportModal";
import { tokens } from "@/styles/tokens";
import type {
  AppMode,
  Profile,
  RouteItem,
  Tab,
  WaypointCreate,
  WaypointItem,
} from "@/types";
import {
  authInitData,
  createCheckin,
  createWaypoint,
  deleteWaypoint,
  devLogin,
  getProfile,
  getRoutes,
  getWaypoints,
  moderateWaypoint,
} from "@/utils/api";
import {
  distanceM,
  getColorScheme,
  getInitData,
  hapticImpact,
  isInsideTelegram,
  notifyReady,
  onThemeChanged,
  requestGeolocation,
} from "@/utils/telegram";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const DEV_KEY = "tma-dev-telegram-id";
const CHECKIN_RADIUS_M = 300;

export default function Home() {
  const [status, setStatus] = useState<"loading" | "login" | "ready">("loading");
  const [authError, setAuthError] = useState<string | null>(null);
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [mode, setMode] = useState<AppMode>("production");
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [pendingClick, setPendingClick] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [devInput, setDevInput] = useState("");

  // ТЗ §1: геолокация при старте (GPS → центр карты, отказ → Бишкек)
  const [geo, setGeo] = useState<{ lat: number; lon: number; granted: boolean } | null>(null);
  const [geoNote, setGeoNote] = useState<string | null>(null);

  // ТЗ §4А: онбординг при первом входе
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ТЗ §4Б: быстрый чек-ин + выбранная точка (модерация на карте)
  const [selectedWp, setSelectedWp] = useState<WaypointItem | null>(null);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [routeFilter, setRouteFilter] = useState<string>("Все");

  // Тема Telegram (ТЗ §4В)
  useEffect(() => {
    const apply = () => {
      const scheme = getColorScheme();
      try {
        document.documentElement.classList.toggle("tma-dark", scheme === "dark");
      } catch {
        /* ignore */
      }
    };
    apply();
    return onThemeChanged(apply);
  }, []);

  // Auth: внутри Telegram — initData, локально — dev-вход
  useEffect(() => {
    notifyReady();
    // Deep-link от бота: ?route=ID
    try {
      const params = new URLSearchParams(window.location.search);
      const r = params.get("route");
      if (r && /^\d+$/.test(r)) {
        setSelectedRouteId(Number(r));
        setTab("map");
      }
    } catch {
      /* ignore */
    }
    const initData = getInitData();
    if (initData) {
      authInitData(initData)
        .then((u) => {
          setTelegramId(u.telegram_id);
          setStatus("ready");
        })
        .catch((e: Error) => {
          setAuthError(e.message);
          setStatus("login");
        });
      return;
    }
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(DEV_KEY) : null;
    if (saved && /^\d+$/.test(saved)) {
      setTelegramId(Number(saved));
      setStatus("ready");
    } else {
      setStatus("login");
    }
  }, []);

  // Геолокация после готовности
  useEffect(() => {
    if (status !== "ready") return;
    let alive = true;
    void requestGeolocation().then((g) => {
      if (!alive) return;
      setGeo(g);
      setGeoNote(
        g.granted
          ? null
          : "GPS недоступен — карта центрирована на Бишкеке. Разреши геолокацию для ближайших точек и чек-инов.",
      );
    });
    return () => {
      alive = false;
    };
  }, [status]);

  const loadData = useCallback(async (id: number, m: AppMode) => {
    setDataError(null);
    try {
      const [p, r, w] = await Promise.all([
        getProfile(id),
        getRoutes(id),
        getWaypoints(id, m),
      ]);
      setProfile(p);
      if (m === "tester" && p.role !== "tester" && p.role !== "admin" && p.role !== "super_admin") {
        setMode("production");
        setWaypoints(await getWaypoints(id, "production"));
      } else {
        setWaypoints(w);
      }
      setRoutes(r);
      // Онбординг — один раз после первой загрузки
      if (shouldShowOnboarding()) setShowOnboarding(true);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (status === "ready" && telegramId != null) void loadData(telegramId, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, telegramId, mode]);

  const handleDevLogin = async () => {
    if (!/^\d+$/.test(devInput.trim())) {
      setAuthError("Введи числовой Telegram ID");
      return;
    }
    const id = Number(devInput.trim());
    try {
      await getProfile(id);
    } catch {
      try {
        await devLogin(id);
      } catch (e) {
        setAuthError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    window.localStorage.setItem(DEV_KEY, String(id));
    setTelegramId(id);
    setAuthError(null);
    setStatus("ready");
  };

  const handleMapClick = useCallback(
    (lat: number, lng: number) => {
      if (mode !== "tester") return;
      setSaveError(null);
      setPendingClick({ lat, lng });
    },
    [mode],
  );

  const handleCreate = async (payload: WaypointCreate) => {
    if (telegramId == null) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createWaypoint(telegramId, payload);
      setPendingClick(null);
      setWaypoints(await getWaypoints(telegramId, mode));
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  // Ближайшая точка в радиусе чек-ина
  const nearestInRadius: { w: WaypointItem; d: number } | null = useMemo(() => {
    if (!geo?.granted) return null;
    let best: { w: WaypointItem; d: number } | null = null;
    for (const w of waypoints) {
      if (w.status !== "published") continue;
      const d = distanceM(geo.lat, geo.lon, w.latitude, w.longitude);
      if (d <= CHECKIN_RADIUS_M && (!best || d < best.d)) best = { w, d };
    }
    return best;
  }, [geo, waypoints]);

  const doCheckin = async () => {
    if (telegramId == null || !nearestInRadius || !geo) return;
    setCheckinBusy(true);
    setCheckinMsg(null);
    try {
      const res = await createCheckin(telegramId, {
        waypoint_id: nearestInRadius.w.id,
        route_id: nearestInRadius.w.route_id,
        latitude: geo.lat,
        longitude: geo.lon,
      });
      hapticImpact("heavy");
      const badges = res.awarded.length > 0 ? ` 🏅 ${res.awarded.join(", ")}!` : "";
      setCheckinMsg(`✅ Чек-ин засчитан!${badges}`);
      // Обновляем профиль (бейджи/статистика)
      setProfile(await getProfile(telegramId));
    } catch (e) {
      setCheckinMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setCheckinBusy(false);
    }
  };

  const doModerate = async (id: number, verdict: "published" | "rejected") => {
    if (telegramId == null) return;
    try {
      const updated = await moderateWaypoint(telegramId, id, verdict);
      setWaypoints((prev) => prev.map((w) => (w.id === id ? updated : w)));
      setSelectedWp(updated);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  const doDeleteWp = async (id: number) => {
    if (telegramId == null) return;
    try {
      await deleteWaypoint(telegramId, id);
      setWaypoints((prev) => prev.filter((w) => w.id !== id));
      setSelectedWp(null);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  };

  if (status === "loading") {
    return <main className="p-6 text-body">Загрузка…</main>;
  }

  if (status === "login" || telegramId == null) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <h1 className="text-h1 text-primary">Tourist TMA</h1>
        {isInsideTelegram() ? (
          <p className="text-body">Открывай Mini App из Telegram — вход автоматический.</p>
        ) : (
          <p className="text-body text-[var(--tma-hint)]">
            Вне Telegram (локальный тест): введи Telegram ID. Если пользователя нет в БД —
            он создастся автоматически тестовым (роль user).
          </p>
        )}
        <input
          className="w-full rounded-xl bg-[var(--tma-secondary-bg)] p-2.5 text-body"
          placeholder="Telegram ID, например 777"
          inputMode="numeric"
          value={devInput}
          onChange={(e) => setDevInput(e.target.value)}
        />
        <button
          onClick={handleDevLogin}
          className="w-full rounded-xl bg-primary py-2.5 font-semibold text-white"
        >
          Войти локально
        </button>
        {authError && <p className="text-body text-accent">{authError}</p>}
      </main>
    );
  }

  if (profile?.is_blocked) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6 text-center">
        <div className="text-5xl">⛔</div>
        <h1 className="text-h1">Аккаунт заблокирован</h1>
        <p className="text-body text-[var(--tma-hint)]">
          Супер-админ ограничил доступ. Напиши в поддержку через @tourist_kg_bot.
        </p>
      </main>
    );
  }

  const testerMode = mode === "tester";
  const isPrivileged = profile?.role === "admin" || profile?.role === "super_admin";
  const filteredRoutes =
    routeFilter === "Все" ? routes : routes.filter((r) => r.difficulty === routeFilter);

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex-1">
          <ModeSwitcher mode={mode} role={profile?.role ?? null} onChange={setMode} />
        </div>
        <button
          onClick={() => setSupportOpen(true)}
          title="Поддержка"
          className="rounded-full bg-[var(--tma-secondary-bg)] px-3 py-2 text-body"
        >
          🆘
        </button>
      </div>

      {dataError && <p className="mb-2 text-body text-accent">{dataError}</p>}
      {geoNote && (
        <p className="mb-2 rounded-xl bg-[var(--tma-secondary-bg)] p-2 text-caption text-[var(--tma-hint)]">
          📍 {geoNote}
        </p>
      )}

      {tab === "home" && (
        <HomePage
          routes={routes}
          waypoints={waypoints}
          userLocation={geo}
          onShowOnMap={(id) => {
            setSelectedRouteId(id);
            setTab("map");
          }}
        />
      )}

      {tab === "map" && (
        <div className="space-y-2">
          {testerMode && (
            <p className="rounded-xl bg-draft/20 p-2 text-caption">
              🧪 Tester-режим: жёлтые — черновики. Кликни по карте, чтобы создать точку.
            </p>
          )}
          <MapView
            routes={routes}
            waypoints={waypoints}
            testerMode={testerMode}
            selectedRouteId={selectedRouteId}
            userLocation={geo}
            onMapClick={handleMapClick}
            onWaypointSelect={setSelectedWp}
          />
          <p className="text-caption text-[var(--tma-hint)]">
            Зелёные — published · Жёлтые — draft · Треки — GPX-линии маршрутов
          </p>

          {/* Быстрый чек-ин (ТЗ §4Б) */}
          {nearestInRadius && (
            <button
              onClick={doCheckin}
              disabled={checkinBusy}
              className="tma-checkin-btn w-full rounded-2xl bg-success py-3 font-bold text-white disabled:opacity-50"
            >
              {checkinBusy
                ? "Отмечаемся…"
                : `📍 Чек-ин: ${nearestInRadius.w.title ?? tokens.typeLabel[nearestInRadius.w.type] ?? "точка"} (${Math.round(nearestInRadius.d)} м)`}
            </button>
          )}
          {checkinMsg && (
            <p className="rounded-xl bg-[var(--tma-secondary-bg)] p-2 text-body">{checkinMsg}</p>
          )}

          {/* Модерация/редактирование метки на карте (ТЗ §3) */}
          {selectedWp && (
            <div className="rounded-2xl bg-[var(--tma-secondary-bg)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-h2">
                  {(tokens.typeEmoji as Record<string, string>)[selectedWp.type] ?? "📍"}{" "}
                  {selectedWp.title ?? (tokens.typeLabel as Record<string, string>)[selectedWp.type]}
                </div>
                <button onClick={() => setSelectedWp(null)} className="px-2 text-[var(--tma-hint)]">✕</button>
              </div>
              <div className="text-caption text-[var(--tma-hint)]">
                {(tokens.typeLabel as Record<string, string>)[selectedWp.type]} · {selectedWp.status} ·{" "}
                {selectedWp.latitude.toFixed(5)}, {selectedWp.longitude.toFixed(5)}
              </div>
              {isPrivileged && (
                <div className="mt-2 flex gap-2">
                  {selectedWp.status !== "published" && (
                    <button
                      onClick={() => doModerate(selectedWp.id, "published")}
                      className="flex-1 rounded-xl bg-success py-1.5 text-body font-semibold text-white"
                    >
                      ✅ Опубликовать
                    </button>
                  )}
                  {selectedWp.status !== "rejected" && (
                    <button
                      onClick={() => doModerate(selectedWp.id, "rejected")}
                      className="flex-1 rounded-xl bg-accent py-1.5 text-body font-semibold text-white"
                    >
                      ❌ Отклонить
                    </button>
                  )}
                  <button
                    onClick={() => doDeleteWp(selectedWp.id)}
                    className="rounded-xl bg-[var(--tma-bg)] px-3 py-1.5 text-body"
                    title="Удалить точку"
                  >
                    🗑
                  </button>
                </div>
              )}
              {!nearestInRadius && geo?.granted && (
                <button
                  onClick={() => {
                    if (telegramId != null && geo) {
                      setCheckinBusy(true);
                      createCheckin(telegramId, {
                        waypoint_id: selectedWp.id,
                        route_id: selectedWp.route_id,
                        latitude: geo.lat,
                        longitude: geo.lon,
                      })
                        .then(async (res) => {
                          hapticImpact("heavy");
                          setCheckinMsg(
                            `✅ Чек-ин засчитан!${res.awarded.length ? ` 🏅 ${res.awarded.join(", ")}!` : ""}`,
                          );
                          setProfile(await getProfile(telegramId));
                        })
                        .catch((e) => setCheckinMsg(e instanceof Error ? e.message : String(e)))
                        .finally(() => setCheckinBusy(false));
                    }
                  }}
                  disabled={checkinBusy}
                  className="mt-2 w-full rounded-xl bg-primary py-2 font-semibold text-white disabled:opacity-50"
                >
                  📍 Чек-ин здесь
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "routes" && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {["Все", "Легкий", "Средний", "Сложный", "Экстремальный"].map((d) => (
              <button
                key={d}
                onClick={() => setRouteFilter(d)}
                className={`rounded-full px-3 py-1 text-caption font-semibold ${
                  routeFilter === d ? "bg-primary text-white" : "bg-[var(--tma-secondary-bg)] text-[var(--tma-hint)]"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          {filteredRoutes.length === 0 && (
            <p className="text-body text-[var(--tma-hint)]">Маршрутов пока нет.</p>
          )}
          {filteredRoutes.map((r) => (
            <RouteCard
              key={r.id}
              route={r}
              onShowOnMap={(id) => {
                setSelectedRouteId(id);
                setTab("map");
              }}
            />
          ))}
        </div>
      )}

      {tab === "profile" && (
        <>
          {profile ? (
            <ProfileCard profile={profile} />
          ) : (
            <p className="text-body text-[var(--tma-hint)]">Загрузка профиля…</p>
          )}
        </>
      )}

      {tab === "admin" && profile?.role === "super_admin" && (
        <AdminDashboard telegramId={telegramId} />
      )}

      {pendingClick && testerMode && (
        <AddWaypointModal
          latitude={pendingClick.lat}
          longitude={pendingClick.lng}
          routes={routes}
          saving={saving}
          error={saveError}
          onClose={() => setPendingClick(null)}
          onSubmit={handleCreate}
        />
      )}

      {supportOpen && (
        <SupportModal telegramId={telegramId} role={profile?.role ?? null} onClose={() => setSupportOpen(false)} />
      )}

      {showOnboarding && (
        <OnboardingTour
          onDone={() => {
            markOnboardingDone();
            setShowOnboarding(false);
          }}
        />
      )}

      <BottomNavigation tab={tab} role={profile?.role ?? null} onChange={setTab} />
    </main>
  );
}
