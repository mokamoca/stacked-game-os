"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/components/ui/ui.module.css";
import GameCard from "@/app/components/ui/game-card";
import type { ExternalGame } from "@/lib/external-games";

type CardState = {
  liked: boolean;
  played: boolean;
  disliked: boolean;
  dont_recommend: boolean;
};

type Props = {
  games: ExternalGame[];
  aiReasons?: Record<string, string>;
  initialStates: Record<string, CardState>;
};

function gameKey(game: ExternalGame): string {
  return `${game.external_source}:${game.external_game_id}`;
}

function defaultState(): CardState {
  return {
    liked: false,
    played: false,
    disliked: false,
    dont_recommend: false
  };
}

function isSameState(a: CardState, b: CardState): boolean {
  return (
    a.liked === b.liked &&
    a.played === b.played &&
    a.disliked === b.disliked &&
    a.dont_recommend === b.dont_recommend
  );
}

function displayTitle(game: ExternalGame): string {
  return game.title_ja || game.title;
}

export default function RecommendationCardList({ games, aiReasons = {}, initialStates }: Props) {
  const gameMap = useMemo(() => new Map(games.map((game) => [gameKey(game), game])), [games]);
  const [stateMap, setStateMap] = useState<Record<string, CardState>>(() => {
    const seeded: Record<string, CardState> = {};
    for (const game of games) {
      const key = gameKey(game);
      seeded[key] = initialStates[key] ?? defaultState();
    }
    return seeded;
  });
  const [dirtyMap, setDirtyMap] = useState<Record<string, true>>({});
  const [saveError, setSaveError] = useState<string>("");

  const stateRef = useRef(stateMap);
  const dirtyRef = useRef(dirtyMap);
  const initialRef = useRef<Record<string, CardState>>({});
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);

  useEffect(() => {
    const seeded: Record<string, CardState> = {};
    for (const game of games) {
      const key = gameKey(game);
      seeded[key] = initialStates[key] ?? defaultState();
    }
    initialRef.current = seeded;
    setStateMap(seeded);
    setDirtyMap({});
  }, [games, initialStates]);

  useEffect(() => {
    stateRef.current = stateMap;
  }, [stateMap]);

  useEffect(() => {
    dirtyRef.current = dirtyMap;
  }, [dirtyMap]);

  const flushDirty = useCallback(
    async (mode: "default" | "beacon" = "default") => {
      const dirtyKeys = Object.keys(dirtyRef.current).filter((key) => dirtyRef.current[key]);
      if (dirtyKeys.length === 0) return;

      if (inFlightRef.current) {
        queuedRef.current = true;
        return;
      }

      const updates = dirtyKeys
        .map((key) => {
          const game = gameMap.get(key);
          if (!game) return null;
          const state = stateRef.current[key] ?? defaultState();
          return {
            external_source: game.external_source,
            external_game_id: game.external_game_id,
            game_title_snapshot: displayTitle(game),
            liked: state.liked,
            played: state.played,
            disliked: state.disliked,
            dont_recommend: state.dont_recommend
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);

      if (updates.length === 0) return;

      inFlightRef.current = true;
      try {
        if (mode === "beacon" && typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          const payload = JSON.stringify({ updates });
          const blob = new Blob([payload], { type: "application/json" });
          const queued = navigator.sendBeacon("/api/game-states/batch", blob);
          if (!queued) {
            throw new Error("ビーコン送信に失敗しました");
          }
        } else {
          const response = await fetch("/api/game-states/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ updates }),
            keepalive: mode === "beacon"
          });
          if (!response.ok) {
            throw new Error(`保存APIエラー (${response.status})`);
          }
        }

        setDirtyMap((prev) => {
          const next = { ...prev };
          for (const key of dirtyKeys) {
            delete next[key];
            const current = stateRef.current[key];
            if (current) initialRef.current[key] = current;
          }
          return next;
        });
        setSaveError("");
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "自動保存に失敗しました");
      } finally {
        inFlightRef.current = false;
        if (queuedRef.current) {
          queuedRef.current = false;
          void flushDirty("default");
        }
      }
    },
    [gameMap]
  );

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushDirty("beacon");
      }
    };
    const onPageHide = () => {
      void flushDirty("beacon");
    };
    const onBeforeUnload = () => {
      void flushDirty("beacon");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
      void flushDirty("beacon");
    };
  }, [flushDirty]);

  useEffect(() => {
    if (!saveError) return;
    const retry = () => {
      void flushDirty("default");
    };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [saveError, flushDirty]);

  function getState(game: ExternalGame): CardState {
    const key = gameKey(game);
    return stateMap[key] ?? defaultState();
  }

  function toggle(game: ExternalGame, field: keyof CardState) {
    const key = gameKey(game);
    const current = getState(game);
    const next = { ...current, [field]: !current[field] };

    if (field === "disliked" && next.disliked) next.liked = false;
    if (field === "liked" && next.liked) {
      next.disliked = false;
      next.dont_recommend = false;
    }
    if (field === "dont_recommend" && next.dont_recommend) {
      next.disliked = true;
      next.liked = false;
    }
    if (!next.disliked && next.dont_recommend) next.dont_recommend = false;

    setStateMap((prev) => ({ ...prev, [key]: next }));

    const baseline = initialRef.current[key] ?? defaultState();
    setDirtyMap((prev) => {
      const nextDirty = { ...prev };
      if (isSameState(next, baseline)) {
        delete nextDirty[key];
      } else {
        nextDirty[key] = true;
      }
      return nextDirty;
    });
  }

  return (
    <>
      {saveError ? (
        <p className={`${styles.notice} ${styles.error}`}>
          自動保存に失敗しました。接続復帰後に再試行します。{" "}
          <button type="button" className={`${styles.button} ${styles.buttonPrimary}`} onClick={() => void flushDirty("default")}>
            今すぐ再試行
          </button>
        </p>
      ) : null}
      <div className={styles.grid}>
        {games.map((game) => {
          const key = gameKey(game);
          return (
            <GameCard
              key={key}
              game={game}
              state={getState(game)}
              reason={aiReasons[key]}
              onToggle={(field) => toggle(game, field)}
            />
          );
        })}
      </div>
    </>
  );
}
