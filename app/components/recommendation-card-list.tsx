"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
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

function displayTitle(game: ExternalGame): string {
  return game.title_ja || game.title;
}

function formatReleaseDate(raw: string): string {
  if (!raw) return "不明";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "不明";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function RecommendationCardList(props: Props) {
  const { games, returnTo, aiReasons = {}, initialStates, upsertAction } = props;
  const initialMap = useMemo(() => initialStates, [initialStates]);
  const [stateMap, setStateMap] = useState<Record<string, CardState>>(initialMap);

  function currentState(game: ExternalGame): CardState {
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

  function updateState(key: string, next: CardState) {
    setStateMap((prev) => ({ ...prev, [key]: next }));
  }

  function toggle(game: ExternalGame, field: keyof CardState) {
    const key = gameKey(game);
    const current = currentState(game);
    const toggled = { ...current, [field]: !current[field] };

    if (field === "disliked" && toggled.disliked) {
      toggled.liked = false;
    }
    if (field === "liked" && toggled.liked) {
      toggled.disliked = false;
      toggled.dont_recommend = false;
    }
    if (field === "dont_recommend" && toggled.dont_recommend) {
      toggled.disliked = true;
      toggled.liked = false;
    }
    if (!toggled.disliked && toggled.dont_recommend) {
      toggled.dont_recommend = false;
    }

    updateState(key, toggled);
  }

  return (
    <div className="grid">
      {games.map((game) => {
        const key = gameKey(game);
        const state = currentState(game);
        return (
          <article key={key} className="gameCard">
            {game.image_url ? (
              <Image src={game.image_url} alt={displayTitle(game)} width={640} height={360} className="gameImage" />
            ) : null}
            <div className="gameBody">
              <h3>{displayTitle(game)}</h3>
              <p className="metaLine">{game.platform}</p>
              <p className="chipLine">ジャンル: {game.genre_tags.length > 0 ? game.genre_tags.join(", ") : "なし"}</p>
              <p className="chipLine">評価: {game.rating > 0 ? `${game.rating.toFixed(1)} / 5` : "不明"}</p>
              <p className="chipLine">メタスコア: {game.metacritic > 0 ? String(game.metacritic) : "不明"}</p>
              <p className="chipLine">発売日: {formatReleaseDate(game.released)}</p>
              {aiReasons[key] ? <p className="aiReason">AI理由: {aiReasons[key]}</p> : null}
            </div>

            <div className="toggleGrid">
              <button
                type="button"
                className={`button ${state.liked ? "active good" : ""}`}
                onClick={() => toggle(game, "liked")}
              >
                好き
              </button>
              <button
                type="button"
                className={`button ${state.played ? "active played" : ""}`}
                onClick={() => toggle(game, "played")}
              >
                遊んだ
              </button>
              <button
                type="button"
                className={`button ${state.disliked ? "active bad" : ""}`}
                onClick={() => toggle(game, "disliked")}
              >
                嫌い
              </button>
              <button
                type="button"
                className={`button ${state.dont_recommend ? "active noReco" : ""}`}
                onClick={() => toggle(game, "dont_recommend")}
              >
                おすすめしない
              </button>
            </div>

            <form action={upsertAction} className="saveRow">
              <input type="hidden" name="external_source" value={game.external_source} />
              <input type="hidden" name="external_game_id" value={game.external_game_id} />
              <input type="hidden" name="game_title_snapshot" value={displayTitle(game)} />
              <input type="hidden" name="liked" value={String(state.liked)} />
              <input type="hidden" name="played" value={String(state.played)} />
              <input type="hidden" name="disliked" value={String(state.disliked)} />
              <input type="hidden" name="dont_recommend" value={String(state.dont_recommend)} />
              <input type="hidden" name="return_to" value={returnTo} />
              <button type="submit" className="button primary">
                保存
              </button>
            </form>
          </article>
        );
      })}
    </div>
  );
}
