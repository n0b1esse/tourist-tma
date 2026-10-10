"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";

import AddWaypointModal from "@/components/AddWaypointModal";
import BottomNavigation from "@/components/BottomNavigation";
import ModeSwitcher from "@/components/ModeSwitcher";
import ProfileCard from "@/components/ProfileCard";
import RouteCard from "@/components/RouteCard";
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
  createWaypoint,
  getProfile,
  getRoutes,
  getWaypoints,
} from "@/utils/api";
import { getInitData, isInsideTelegram, notifyReady } from "@/utils/telegram";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const DEV_KEY = "tma-dev-telegram-id";

export default function Home() {
  const [status, setStatus] = useState<"loading" | "login" | "ready">("loading");
  const [authError, setAuthError] = useState<string | null>(null);
  const [telegramId, setTelegramId] = useState<number | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("map");
  const [mode, setMode] = useState<AppMode>("production");
  const [routes, setRoutes] = useState<RouteItem[]>([]);
  const [waypoints, setWaypoints] = useState<WaypointItem[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [pendingClick, setPendingClick] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [devInput, setDevInput] = useState("");

  // Шаг 3-auth: внутри Telegram — initData, локально — dev-вход по Telegram ID
  useEffect(() => {
    notifyReady();
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

  const loadData = useCallback(async (id: number, m: AppMode) => {
    setDataError(null);
    try {
      const [p, r, w] = await Promise.all([
        getProfile(id),
        getRoutes(id),
        getWaypoints(id, m),
      ]);
      setProfile(p);
      // Обычного user выкидываем из tester-режима (бэкенд тоже запретит 403)
      if (m === "tester" && p.role !== "tester" && p.role !== "admin") {
        setMode("production");
        setWaypoints(await getWaypoints(id, "production"));
      } else {
        setWaypoints(w);
      }
      setRoutes(r);
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
      await getProfile(id); // проверяем, что пользователь есть в БД
      window.localStorage.setItem(DEV_KEY, String(id));
      setTelegramId(id);
      setAuthError(null);
      setStatus("ready");
    } catch (e) {
      setAuthError(
        `Пользователь ${id} не найден: сначала POST /api/auth/init-data. (${e instanceof Error ? e.message : e})`,
      );
    }
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
            Вне Telegram (локальный тест): введи Telegram ID. Пользователь должен существовать в
            БД — создаётся через POST /api/auth/init-data.
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

  const testerMode = mode === "tester";

  return (
    <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <div className="mb-3">
        <ModeSwitcher mode={mode} role={profile?.role ?? null} onChange={setMode} />
      </div>

      {dataError && <p className="mb-2 text-body text-accent">{dataError}</p>}

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
            onMapClick={handleMapClick}
          />
          <p className="text-caption text-[var(--tma-hint)]">
            Зелёные — published · Жёлтые — draft · Треки — GPX-линии маршрутов
          </p>
        </div>
      )}

      {tab === "routes" && (
        <div className="space-y-3">
          {routes.length === 0 && (
            <p className="text-body text-[var(--tma-hint)]">Маршрутов пока нет.</p>
          )}
          {routes.map((r) => (
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

      <BottomNavigation tab={tab} onChange={setTab} />
    </main>
  );
}
