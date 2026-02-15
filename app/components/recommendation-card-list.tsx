"use client";

import { useMemo, useState } from "react";
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
  returnTo: string;
  aiReasons?: Record<string, string>;
  initialStates: Record<string, CardState>;
  upsertAction: (formData: FormData) => void | Promise<void>;
};

function gameKey(game: ExternalGame): string {
  return `${game.external_source}:${game.external_game_id}`;
}

export default function RecommendationCardList({ games, returnTo, aiReasons = {}, initialStates, upsertAction }: Props) {
  const initialMap = useMemo(() => initialStates, [initialStates]);
  const [stateMap, setStateMap] = useState<Record<string, CardState>>(initialMap);

  function getState(game: ExternalGame): CardState {
    const key = gameKey(game);
    return (
      stateMap[key] ?? {
        liked: false,
        played: false,
        disliked: false,
        dont_recommend: false
      }
    );
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
  }

  return (
    <div className={styles.grid}>
      {games.map((game) => {
        const key = gameKey(game);
        return (
          <GameCard
            key={key}
            game={game}
            state={getState(game)}
            reason={aiReasons[key]}
            returnTo={returnTo}
            onToggle={(field) => toggle(game, field)}
            upsertAction={upsertAction}
          />
        );
      })}
    </div>
  );
}
