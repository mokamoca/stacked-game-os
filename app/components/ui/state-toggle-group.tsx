"use client";

import styles from "@/app/components/ui/ui.module.css";

type CardState = {
  liked: boolean;
  played: boolean;
  disliked: boolean;
  dont_recommend: boolean;
};

type Props = {
  state: CardState;
  onToggle: (field: keyof CardState) => void;
};

export default function StateToggleGroup({ state, onToggle }: Props) {
  return (
    <div className={styles.toggleGrid}>
      <button
        type="button"
        className={`${styles.button} ${styles.toggle} ${state.liked ? styles.onGood : ""}`}
        onClick={() => onToggle("liked")}
      >
        好き
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.toggle} ${state.played ? styles.onPlayed : ""}`}
        onClick={() => onToggle("played")}
      >
        遊んだ
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.toggle} ${state.disliked ? styles.onBad : ""}`}
        onClick={() => onToggle("disliked")}
      >
        嫌い
      </button>
      <button
        type="button"
        className={`${styles.button} ${styles.toggle} ${state.dont_recommend ? styles.onNoReco : ""}`}
        onClick={() => onToggle("dont_recommend")}
      >
        おすすめしない
      </button>
    </div>
  );
}
