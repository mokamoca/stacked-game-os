"use client";

import Image from "next/image";
import styles from "@/app/components/ui/ui.module.css";
import type { ExternalGame } from "@/lib/external-games";
import StateToggleGroup from "@/app/components/ui/state-toggle-group";

type CardState = {
  liked: boolean;
  played: boolean;
  disliked: boolean;
  dont_recommend: boolean;
};

type Props = {
  game: ExternalGame;
  state: CardState;
  reason?: string;
  returnTo: string;
  onToggle: (field: keyof CardState) => void;
  upsertAction: (formData: FormData) => void | Promise<void>;
};

function displayTitle(game: ExternalGame): string {
  return game.title_ja || game.title;
}

function formatReleaseDate(raw: string): string {
  if (!raw) return "不明";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "不明";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function GameCard({ game, state, reason, returnTo, onToggle, upsertAction }: Props) {
  return (
    <article className={styles.gameCard}>
      {game.image_url ? (
        <Image src={game.image_url} alt={displayTitle(game)} width={640} height={360} className={styles.gameImage} />
      ) : (
        <div className={styles.gamePlaceholder} />
      )}

      <div className={styles.gameBody}>
        <h3 className={styles.gameTitle}>{displayTitle(game)}</h3>
        <p className={styles.meta}>{game.platform}</p>
        <p className={styles.meta}>ジャンル: {game.genre_tags.length > 0 ? game.genre_tags.join(", ") : "なし"}</p>
        <p className={styles.meta}>評価: {game.rating > 0 ? `${game.rating.toFixed(1)} / 5` : "不明"}</p>
        <p className={styles.meta}>メタスコア: {game.metacritic > 0 ? String(game.metacritic) : "不明"}</p>
        <p className={styles.meta}>発売日: {formatReleaseDate(game.released)}</p>
        {reason ? <p className={styles.reason}>AI理由: {reason}</p> : null}
      </div>

      <StateToggleGroup state={state} onToggle={onToggle} />

      <form action={upsertAction} className={styles.saveRow}>
        <input type="hidden" name="external_source" value={game.external_source} />
        <input type="hidden" name="external_game_id" value={game.external_game_id} />
        <input type="hidden" name="game_title_snapshot" value={displayTitle(game)} />
        <input type="hidden" name="liked" value={String(state.liked)} />
        <input type="hidden" name="played" value={String(state.played)} />
        <input type="hidden" name="disliked" value={String(state.disliked)} />
        <input type="hidden" name="dont_recommend" value={String(state.dont_recommend)} />
        <input type="hidden" name="return_to" value={returnTo} />
        <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}>
          保存
        </button>
      </form>
    </article>
  );
}
