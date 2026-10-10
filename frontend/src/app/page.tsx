"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";

import AddWaypointModal from "@/components/AddWaypointModal";
import AdminDashboard from "@/components/AdminDashboard";
import BottomNavigation from "@/components/BottomNavigation";
import GpsTracker, { type LiveTrack } from "@/components/GpsTracker";
import HomePage from "@/components/HomePage";
import ModeSwitcher from "@/components/ModeSwitcher";
import OnboardingTour, { markOnboardingDone, shouldShowOnboarding } from "@/components/OnboardingTour";
import PedometerWidget from "@/components/PedometerWidget";
import ProfileCard from "@/components/ProfileCard";
import RouteCard from "@/components/RouteCard";
import RouteDrawer from "@/components/RouteDrawer";
import SupportModal from "@/components/SupportModal";
import TrackSaveModal from "@/components/TrackSaveModal";
import { tokens } from "@/styles/tokens";
import type {
  ActivityType,
  AppMode,
  Profile,
  RouteItem,
  Tab,
  TrackPoint,
  WaypointCreate,
  WaypointItem,
} from "@/types";
import { ACTIVITY_META } from "@/types";
import {
  authInitData,
  createCheckin,
  createWaypoint,
  deleteWaypoint,
  devLogin,
  getMyRoutes,
  getProfile,
  getRoutes,
  getWaypoints,
  moderateWaypoint,
  proposeRoute,
  recordTrack,
} from "@/utils/api";
import {
  distanceM,
  getCachedGeo,
  getColorScheme,
  hapticImpact,
  isInsideTelegram,
  notifyReady,
  onThemeChanged,
  requestGeolocation,
  waitForInitData,
} from "@/utils/telegram";
import {
  isGuestId,
  loadDataCache,
  loadProfileCache,
  makeGuestProfile,
  saveDataCache,
  saveProfileCache,
} from "@/utils/offline";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const DEV_KEY = "tma-dev-telegram-id";
const CHECKIN_RADIUS_M = 300;

export default function Home() {
  const [status, setStatus] = useState<"loading" | "login" | "ready" | "error">("loading");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authAttempt, setAuthAttempt] = useState(0);
  const [hasCache, setHasCache] = useState(false);
  const [offlineMode, setOfflineMode] = useState(false);
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [mode, setMode] = useState<AppMode>("production");
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [myRoutes, setMyRoutes] = useState<RouteItem[]>([]);
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [pendingClick, setPendingClick] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [devInput, setDevInput] = useState("");

  const [geo, setGeo] = useState<{ lat: number; lon: number; granted: boolean } | null>(null);
  const [geoNote, setGeoNote] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedWp, setSelectedWp] = useState<WaypointItem | null>(null);
  const [checkinBusy, setCheckinBusy] = useState(false);
  const [checkinMsg, setCheckinMsg] = useState<string | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [routeFilter, setRouteFilter] = useState<string>("Все");
  const [activityFilter, setActivityFilter] = useState<"Все" | ActivityType>("Все");

  // Fitness: живой трек + черновик конструктора + модалка сохранения
  const [liveTrack, setLiveTrack] = useState<LiveTrack | null>(null);
  const [pendingTrack, setPendingTrack] = useState<{ track: LiveTrack; activity: ActivityType } | null>(null);
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackMsg, setTrackMsg] = useState<string | null>(null);
  const [drawerPoints, setDrawerPoints] = useState<TrackPoint[]>([]);
  const [drawerMode, setDrawerMode] = useState(false);

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

  // Авторизация: initData (с ожиданием поздней подгрузки скрипта) → dev-ID → login.
  // Любая ошибка бэкенда ведёт на экран «error» с Retry/кэшем/гостем, а НЕ на вечную «Загрузку…».
  useEffect(() => {
    let cancelled = false;
    notifyReady();
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
    setStatus("loading");
    setAuthError(null);
    setHasCache(loadProfileCache() != null);
    void (async () => {
      try {
        // Даём telegram-web-app.js до 3 c на подгрузку (иначе ложный dev-путь внутри Telegram)
        const initData = await waitForInitData(3000);
        if (cancelled) return;
        if (initData) {
          try {
            const u = await authInitData(initData);
            if (cancelled) return;
            setTelegramId(u.telegram_id);
            setOfflineMode(false);
            setStatus("ready");
          } catch (e) {
            if (cancelled) return;
            setAuthError(e instanceof Error ? e.message : String(e));
            setHasCache(loadProfileCache() != null);
            setStatus("error");
          }
          return;
        }
        const saved = typeof window !== "undefined" ? window.localStorage.getItem(DEV_KEY) : null;
        if (saved && /^\d+$/.test(saved)) {
          setTelegramId(Number(saved));
          setOfflineMode(false);
          setStatus("ready");
        } else {
          setStatus("login");
        }
      } catch (e) {
        if (cancelled) return;
        setAuthError(e instanceof Error ? e.message : String(e));
        setHasCache(loadProfileCache() != null);
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authAttempt]);

  // Сторожевой таймер: если «loading» висит дольше 20 c (зависший fetch без abort) —
  // принудительно показываем экран ошибки вместо вечной «Загрузки…».
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => {
      setStatus((s) => {
        if (s !== "loading") return s;
        setAuthError((prev) => prev ?? "Превышено время ожидания. Сервер не отвечает.");
        setHasCache(loadProfileCache() != null);
        return "error";
      });
    }, 20000);
    return () => clearTimeout(t);
  }, [status, authAttempt]);

  const retryAuth = useCallback(() => {
    setAuthAttempt((n) => n + 1);
  }, []);

  const continueWithCache = useCallback(() => {
    const cached = loadProfileCache();
    if (!cached) return;
    const data = loadDataCache();
    setProfile(cached);
    if (data) {
      setRoutes(data.routes);
      setWaypoints(data.waypoints);
      setMyRoutes(data.myRoutes);
    }
    setTelegramId(cached.telegram_id);
    setOfflineMode(true);
    setAuthError(null);
    setStatus("ready");
  }, []);

  const enterGuestMode = useCallback(() => {
    const guest = makeGuestProfile();
    const data = loadDataCache();
    setProfile(guest);
    if (data) {
      setRoutes(data.routes);
      setWaypoints(data.waypoints);
      setMyRoutes([]);
    }
    setTelegramId(0);
    setOfflineMode(true);
    setAuthError(null);
    setStatus("ready");
  }, []);

  // Геолокация: мгновенная отрисовка из кэша (без системного промпта),
  // затем один запрос; свежий кэш requestGeolocation отдаёт сам без промпта.
  useEffect(() => {
    if (status !== "ready") return;
    let alive = true;
    try {
      const instant = getCachedGeo();
      if (instant) {
        setGeo(instant);
        if (!instant.granted) {
          setGeoNote(
            "GPS недоступен (последние данные из кэша) — карта центрирована на Бишкеке. Разреши геолокацию для ближайших точек и чек-инов.",
          );
        }
      }
    } catch {
      /* ignore */
    }
    void requestGeolocation()
      .then((g) => {
        if (!alive) return;
        setGeo(g);
        setGeoNote(
          g.granted
            ? null
            : "GPS недоступен — карта центрирована на Бишкеке. Разреши геолокацию для ближайших точек и чек-инов.",
        );
      })
      .catch(() => {
        if (!alive) return;
        // Тихий фолбэк: оставляем кэш/Бишкек, приложение продолжает работать
        setGeo((prev) => prev ?? { lat: 42.8746, lon: 74.5698, granted: false });
      });
    return () => {
      alive = false;
    };
  }, [status]);

  // Загрузка данных с частичной деградацией: каждый запрос падает независимо,
  // успешное кэшируется; профиль при ошибке берём из кэша (офлайн-режим).
  const loadData = useCallback(async (id: number, m: AppMode) => {
    setDataError(null);
    if (isGuestId(id)) {
      // Гость: серверных данных нет — только локальный кэш
      const data = loadDataCache();
      if (data) {
        setRoutes(data.routes);
        setWaypoints(data.waypoints);
      }
      setMyRoutes([]);
      return;
    }
    let p: Profile;
    try {
      p = await getProfile(id);
      saveProfileCache(p);
      setOfflineMode(false);
    } catch (e) {
      const cached = loadProfileCache();
      if (cached && cached.telegram_id === id) {
        p = cached;
        setOfflineMode(true);
        setDataError("Офлайн-режим: показаны сохранённые данные. Проверь соединение.");
      } else {
        setDataError(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    setProfile(p);
    const [r, w, mine] = await Promise.all([
      getRoutes(id).catch(() => loadDataCache()?.routes ?? []),
      (async () => {
        try {
          const wp = await getWaypoints(id, m);
          if (m === "tester" && p.role !== "tester" && p.role !== "admin" && p.role !== "super_admin") {
            setMode("production");
            return await getWaypoints(id, "production").catch(() => loadDataCache()?.waypoints ?? []);
          }
          return wp;
        } catch {
          return loadDataCache()?.waypoints ?? [];
        }
      })(),
      getMyRoutes(id).catch(() => loadDataCache()?.myRoutes ?? [] as RouteItem[]),
    ]);
    setRoutes(r);
    setWaypoints(w);
    setMyRoutes(mine);
    saveDataCache({ routes: r, waypoints: w, myRoutes: mine });
    if (shouldShowOnboarding()) setShowOnboarding(true);
  }, []);

  useEffect(() => {
    if (status === "ready" && telegramId != null) void loadData(telegramId, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, telegramId, mode]);

  const refreshAll = useCallback(async () => {
    if (telegramId == null || isGuestId(telegramId)) return;
    try {
      const [p, r, mine] = await Promise.all([
        getProfile(telegramId),
        getRoutes(telegramId),
        getMyRoutes(telegramId).catch(() => [] as RouteItem[]),
      ]);
      setProfile(p);
      saveProfileCache(p);
      setRoutes(r);
      setMyRoutes(mine);
      saveDataCache({ routes: r, waypoints, myRoutes: mine });
      setOfflineMode(false);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e));
    }
  }, [telegramId, waypoints]);

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
      // Конструктор: клик добавляет точку черновика
      if (drawerMode) {
        setDrawerPoints((prev) => [...prev, { lat, lon: lng, ele: null, t: Date.now() }]);
        return;
      }
      if (mode !== "tester") return;
      setSaveError(null);
      setPendingClick({ lat, lng });
    },
    [mode, drawerMode],
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
    if (isGuestId(telegramId)) {
      setCheckinMsg("👀 Гостевой режим: чек-ины не сохраняются. Войди через Telegram, чтобы собирать бейджи.");
      return;
    }
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

  const doPropose = async (id: number) => {
    if (telegramId == null) return;
    try {
      await proposeRoute(telegramId, id);
      setTrackMsg("📤 Маршрут отправлен гидам на модерацию!");
      await refreshAll();
    } catch (e) {
      setTrackMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const doSaveTrack = async (data: {
    title: string;
    description: string | null;
    activity_type: ActivityType;
    difficulty: string;
    photo_url: string | null;
  }) => {
    if (telegramId == null || pendingTrack == null) return;
    if (isGuestId(telegramId)) {
      setTrackError("👀 Гостевой режим: трек не сохранится на сервере. Войди через Telegram для сохранения.");
      return;
    }
    setTrackBusy(true);
    setTrackError(null);
    try {
      const hours = Math.floor(pendingTrack.track.durationSec / 3600);
      const mins = Math.round((pendingTrack.track.durationSec % 3600) / 60);
      const res = await recordTrack(telegramId, {
        title: data.title,
        description: data.description,
        activity_type: data.activity_type,
        difficulty: data.difficulty,
        track_points: pendingTrack.track.points,
        steps_count: pendingTrack.track.steps,
        photo_url: data.photo_url,
        estimated_time: hours > 0 ? `${hours} ч ${mins} мин` : `${mins} мин`,
      });
      hapticImpact("heavy");
      setPendingTrack(null);
      setLiveTrack(null);
      const badges = res.awarded.length > 0 ? ` 🏅 ${res.awarded.join(", ")}!` : "";
      setTrackMsg(`✅ Трек сохранён! ${res.route.distance_km.toFixed(2)} км, ~${res.calories} ккал.${badges}`);
      await refreshAll();
      setTab("profile");
    } catch (e) {
      setTrackError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrackBusy(false);
    }
  };

  if (status === "loading") {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6 text-center">
        <div className="text-4xl animate-pulse">🏔️</div>
        <p className="text-body">Загрузка…</p>
        <p className="text-caption text-[var(--tma-hint)]">Подключаемся к серверу (до 10 c)…</p>
      </main>
    );
  }

  // Ошибка сети/бэкенда: НИКОГДА не вечная «Загрузка…» — Retry + кэш + гость.
  if (status === "error") {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6 text-center">
        <div className="text-5xl">🛰</div>
        <h1 className="text-h1">Не получилось подключиться</h1>
        <p className="text-body text-[var(--tma-hint)]">{authError ?? "Сервер недоступен."}</p>
        <button
          onClick={retryAuth}
          className="w-full rounded-xl bg-primary py-2.5 font-semibold text-white"
        >
          🔄 Повторить попытку
        </button>
        {hasCache && (
          <button
            onClick={continueWithCache}
            className="w-full rounded-xl bg-[var(--tma-secondary-bg)] py-2.5 font-semibold"
          >
            📦 Продолжить с сохранёнными данными
          </button>
        )}
        <button
          onClick={enterGuestMode}
          className="w-full rounded-xl bg-[var(--tma-secondary-bg)] py-2.5 font-semibold"
        >
          👀 Войти как гость (карта и трекер без сервера)
        </button>
        <button onClick={() => setStatus("login")} className="text-caption text-[var(--tma-hint)] underline">
          Войти по Telegram ID вручную
        </button>
      </main>
    );
  }

  if (status === "login" || telegramId == null) {
    return (
      <main className="mx-auto max-w-md space-y-3 p-6">
        <h1 className="text-h1 text-primary">Tourist TMA</h1>
        {isInsideTelegram() ? (
          <p className="text-body">Открывай Mini App из Telegram — вход автоматический.</p>
        ) : (
          <p className="text-body text-[var(--tma-hint)]">
            Вне Telegram (локальный тест): введи Telegram ID, будет создан мок-профиль.
            Если пользователя нет в БД — он создастся автоматически тестовым (роль user).
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
        <button
          onClick={enterGuestMode}
          className="w-full rounded-xl bg-[var(--tma-secondary-bg)] py-2.5 font-semibold"
        >
          👀 Продолжить как гость
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
  const filteredRoutes = routes.filter((r) => {
    if (routeFilter !== "Все" && r.difficulty !== routeFilter) return false;
    if (activityFilter !== "Все" && r.activity_type !== activityFilter) return false;
    return true;
  });

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

      {offlineMode && (
        <p className="mb-2 rounded-xl bg-draft/20 p-2 text-caption">
          📦 Офлайн/гостевой режим — данные могут быть устаревшими. {isGuestId(telegramId) ? "Войди через Telegram для синхронизации." : "Нажми \"Повторить\" на экране ошибки или обнови страницу."}
        </p>
      )}
      {dataError && <p className="mb-2 text-body text-accent">{dataError}</p>}
      {geoNote && (
        <p className="mb-2 rounded-xl bg-[var(--tma-secondary-bg)] p-2 text-caption text-[var(--tma-hint)]">
          📍 {geoNote}
        </p>
      )}
      {trackMsg && (
        <p className="mb-2 rounded-xl bg-success/15 p-2 text-body">{trackMsg}</p>
      )}

      {tab === "home" && (
        <HomePage
          routes={routes}
          waypoints={waypoints}
          userLocation={geo}
          telegramId={telegramId}
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
          {drawerMode && (
            <p className="rounded-xl bg-primary/15 p-2 text-caption">
              ✏️ Конструктор: кликай по карте — точки идут в черновик (вкладка «Запись»).
              <button onClick={() => setDrawerMode(false)} className="ml-2 underline">Выйти</button>
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
            liveTrack={liveTrack?.points ?? null}
            draftPoints={drawerPoints}
            drawerMode={drawerMode}
          />
          <p className="text-caption text-[var(--tma-hint)]">
            Зелёные — published · Жёлтые — draft · Красная — запись трека · Пунктир — конструктор
          </p>

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

      {tab === "track" && (
        <div className="space-y-3">
          <PedometerWidget
            telegramId={telegramId}
            liveSteps={liveTrack?.steps}
            liveDistanceKm={liveTrack?.distanceKm}
          />
          <GpsTracker
            onFinish={(track, activity) => setPendingTrack({ track, activity })}
            onUpdate={(t) => setLiveTrack(t.points.length > 0 ? t : null)}
          />
          {/* Мини-карта живого трека */}
          {(liveTrack && liveTrack.points.length > 0) || drawerPoints.length > 0 ? (
            <MapView
              routes={[]}
              waypoints={[]}
              testerMode={false}
              selectedRouteId={null}
              userLocation={geo}
              onMapClick={handleMapClick}
              liveTrack={liveTrack?.points ?? null}
              draftPoints={drawerPoints}
              drawerMode={drawerMode}
            />
          ) : null}
          {isPrivileged ? (
            <div className="space-y-2">
              <button
                onClick={() => {
                  setDrawerMode((v) => !v);
                  if (!drawerMode) setTab("map");
                }}
                className={`w-full rounded-xl py-2 font-semibold ${drawerMode ? "bg-accent text-white" : "bg-[var(--tma-secondary-bg)]"}`}
              >
                {drawerMode ? "✏️ Режим рисования ВКЛ — кликай по карте" : "✏️ Включить конструктор (рисование по карте)"}
              </button>
              <RouteDrawer
                telegramId={telegramId}
                draftPoints={drawerPoints}
                onDraftChange={setDrawerPoints}
                onPublished={refreshAll}
              />
            </div>
          ) : (
            <p className="rounded-xl bg-[var(--tma-secondary-bg)] p-2 text-caption text-[var(--tma-hint)]">
              ✏️ Конструктор доступен гидам (admin). Твой трек после записи сохранится в «Мои прогулки»,
              откуда его можно предложить гидам 📤
            </p>
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
          <div className="flex flex-wrap gap-1.5">
            {(["Все", ...(Object.keys(ACTIVITY_META) as ActivityType[])] as const).map((a) => (
              <button
                key={a}
                onClick={() => setActivityFilter(a)}
                className={`rounded-full px-2.5 py-1 text-caption font-semibold ${
                  activityFilter === a ? "bg-primary text-white" : "bg-[var(--tma-secondary-bg)] text-[var(--tma-hint)]"
                }`}
              >
                {a === "Все" ? "Все типы" : `${ACTIVITY_META[a].emoji} ${ACTIVITY_META[a].label}`}
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
            <ProfileCard
              profile={profile}
              telegramId={telegramId}
              myRoutes={myRoutes}
              onShowOnMap={(id) => {
                setSelectedRouteId(id);
                setTab("map");
              }}
              onPropose={doPropose}
            />
          ) : (
            <p className="text-body text-[var(--tma-hint)]">Загрузка профиля…</p>
          )}
        </>
      )}

      {tab === "admin" && profile?.role === "super_admin" && (
        <AdminDashboard telegramId={telegramId} />
      )}

      {pendingClick && testerMode && !drawerMode && (
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

      {pendingTrack && (
        <TrackSaveModal
          track={pendingTrack.track}
          initialActivity={pendingTrack.activity}
          saving={trackBusy}
          error={trackError}
          onClose={() => setPendingTrack(null)}
          onSubmit={doSaveTrack}
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
