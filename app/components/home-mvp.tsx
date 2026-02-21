"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "@/app/components/mvp.module.css";
import {
  DISMISS_REASONS,
  ERA_MODES,
  GENRE_OPTIONS,
  MOOD_OPTIONS,
  PLATFORM_OPTIONS,
  type EraMode
} from "@/lib/mvp-constants";

type Filters = {
  era_mode: EraMode;
  genre_codes: string[] | null;
  platform_codes: string[] | null;
};

type Recommendation = {
  game: {
    id: string;
    title: string;
    release_year: number | null;
    cover_url: string | null;
    summary_short: string;
    genres: string[];
    platforms: string[];
  };
  why_text: string;
  shown_event_id: string;
};

const INITIAL_FILTERS: Filters = {
  era_mode: "ps4_plus",
  genre_codes: null,
  platform_codes: null
};

function toggleCode(current: string[] | null, code: string): string[] | null {
  if (current == null) return [code];
  if (current.includes(code)) {
    const next = current.filter((item) => item !== code);
    return next.length === 0 ? null : next;
  }
  return [...current, code];
}

export default function HomeMvp() {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [selectedMoods, setSelectedMoods] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [dismissReason, setDismissReason] = useState<string>(DISMISS_REASONS[0].code);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [exhausted, setExhausted] = useState<boolean>(false);

  const moodSet = useMemo(() => new Set(selectedMoods), [selectedMoods]);

  const fetchFilters = useCallback(async () => {
    const response = await fetch("/api/filters", { method: "GET", cache: "no-store" });
    const body = (await response.json()) as Filters & { error?: string };
    if (!response.ok) {
      throw new Error(body.error ?? "filters_fetch_failed");
    }
    return body;
  }, []);

  const requestNext = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/recommendations/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const body = (await response.json()) as
        | { exhausted: true; message: string; suggestions: string[] }
        | { exhausted: false; recommendation: Recommendation; error?: string }
        | { error?: string };

      if (!response.ok) throw new Error("error" in body && body.error ? body.error : "recommendation_failed");

      if ("exhausted" in body && body.exhausted) {
        setExhausted(true);
        setRecommendation(null);
        return;
      }

      if ("recommendation" in body) {
        setRecommendation(body.recommendation);
        setExhausted(false);
      }
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "recommendation_failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveFilters = useCallback(
    async (nextFilters: Filters, requestNewRecommendation = true) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/filters", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(nextFilters)
        });
        const body = (await response.json()) as Filters & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "filters_update_failed");
        setFilters({
          era_mode: body.era_mode,
          genre_codes: body.genre_codes,
          platform_codes: body.platform_codes
        });
        if (requestNewRecommendation) {
          await requestNext();
        }
      } catch (saveError) {
        const message = saveError instanceof Error ? saveError.message : "filters_update_failed";
        setError(message);
        setLoading(false);
      }
    },
    [requestNext]
  );

  const sendEvent = useCallback(
    async (action: "reroll" | "dismiss" | "wishlist" | "played" | "blocked", reasonCode?: string) => {
      if (!recommendation) return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/recommendations/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game_id: recommendation.game.id,
            shown_event_id: recommendation.shown_event_id,
            action,
            reason_code: reasonCode ?? null
          })
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) throw new Error(body.error ?? "event_failed");
        await requestNext();
      } catch (eventError) {
        const message = eventError instanceof Error ? eventError.message : "event_failed";
        setError(message);
        setLoading(false);
      }
    },
    [recommendation, requestNext]
  );

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const currentFilters = await fetchFilters();
        setFilters({
          era_mode: currentFilters.era_mode,
          genre_codes: currentFilters.genre_codes,
          platform_codes: currentFilters.platform_codes
        });
        await requestNext();
      } catch (initialError) {
        const message = initialError instanceof Error ? initialError.message : "initial_load_failed";
        setError(message);
        setLoading(false);
      }
    };
    void run();
  }, [fetchFilters, requestNext]);

  const onEraChange = async (eraMode: EraMode) => {
    if (filters.era_mode === eraMode) return;
    await saveFilters({ ...filters, era_mode: eraMode });
  };

  const onGenreToggle = async (code: string) => {
    await saveFilters({ ...filters, genre_codes: toggleCode(filters.genre_codes, code) });
  };

  const onPlatformToggle = async (code: string) => {
    await saveFilters({ ...filters, platform_codes: toggleCode(filters.platform_codes, code) });
  };

  const onSuggestion = async (kind: "clear_genres" | "add_platform" | "set_retro") => {
    if (kind === "clear_genres") {
      await saveFilters({ ...filters, genre_codes: null });
      return;
    }
    if (kind === "set_retro") {
      await saveFilters({ ...filters, era_mode: "retro_included" });
      return;
    }
    const selected = new Set(filters.platform_codes ?? []);
    const addable = PLATFORM_OPTIONS.find((item) => !selected.has(item.code));
    if (!addable) {
      setError("追加できるプラットフォームがありません");
      return;
    }
    const nextCodes = filters.platform_codes == null ? [addable.code] : [...filters.platform_codes, addable.code];
    await saveFilters({ ...filters, platform_codes: nextCodes });
  };

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <h1 className={styles.title}>今日の1本</h1>
        <p className={styles.sub}>条件はこの画面のチップで調整できます。</p>
      </section>

      <section className={styles.panel}>
        <div className={styles.grid}>
          <p className={styles.sub}>年代</p>
          <div className={styles.chips}>
            <button
              type="button"
              className={`${styles.chip} ${filters.era_mode === "ps4_plus" ? styles.chipActive : ""}`}
              onClick={() => void onEraChange("ps4_plus")}
              disabled={loading}
            >
              PS4以降
            </button>
            <button
              type="button"
              className={`${styles.chip} ${filters.era_mode === "retro_included" ? styles.chipActive : ""}`}
              onClick={() => void onEraChange("retro_included")}
              disabled={loading}
            >
              レトロも含める
            </button>
          </div>

          <p className={styles.sub}>プラットフォーム（未選択=全て）</p>
          <div className={styles.chips}>
            {PLATFORM_OPTIONS.map((item) => {
              const active = filters.platform_codes != null && filters.platform_codes.includes(item.code);
              return (
                <button
                  key={item.code}
                  type="button"
                  className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                  onClick={() => void onPlatformToggle(item.code)}
                  disabled={loading}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <p className={styles.sub}>ジャンル（未選択=全て）</p>
          <div className={styles.chips}>
            {GENRE_OPTIONS.map((item) => {
              const active = filters.genre_codes != null && filters.genre_codes.includes(item.code);
              return (
                <button
                  key={item.code}
                  type="button"
                  className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                  onClick={() => void onGenreToggle(item.code)}
                  disabled={loading}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <p className={styles.sub}>気分（6つ）</p>
          <div className={styles.chips}>
            {MOOD_OPTIONS.map((item) => {
              const active = moodSet.has(item.code);
              return (
                <button
                  key={item.code}
                  type="button"
                  className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                  onClick={() =>
                    setSelectedMoods((prev) =>
                      prev.includes(item.code) ? prev.filter((v) => v !== item.code) : [...prev, item.code]
                    )
                  }
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.sub}>読み込み中...</p> : null}

      {exhausted ? (
        <section className={styles.panel}>
          <p className={styles.empty}>この条件では未提示の候補が尽きました</p>
          <div className={styles.actions}>
            <button className={styles.button} type="button" onClick={() => void onSuggestion("clear_genres")} disabled={loading}>
              ジャンル解除
            </button>
            <button className={styles.button} type="button" onClick={() => void onSuggestion("add_platform")} disabled={loading}>
              プラットフォーム追加
            </button>
            <button className={styles.button} type="button" onClick={() => void onSuggestion("set_retro")} disabled={loading}>
              年代をレトロへ
            </button>
          </div>
        </section>
      ) : null}

      {!exhausted && recommendation ? (
        <section className={styles.card}>
          {recommendation.game.cover_url ? (
            <img className={styles.image} src={recommendation.game.cover_url} alt={recommendation.game.title} />
          ) : null}
          <div className={styles.body}>
            <h2 className={styles.gameTitle}>{recommendation.game.title}</h2>
            <p className={styles.sub}>
              {recommendation.game.release_year ?? "年不明"} | {recommendation.game.platforms.join(" / ")}
            </p>
            <p className={styles.sub}>{recommendation.game.genres.join("・")}</p>
            <p className={styles.reason}>{recommendation.why_text}</p>
            <div className={styles.actions}>
              <button className={`${styles.button} ${styles.buttonPrimary}`} type="button" onClick={() => void sendEvent("reroll")} disabled={loading}>
                リロール
              </button>
              <button className={styles.button} type="button" onClick={() => void sendEvent("wishlist")} disabled={loading}>
                気になる
              </button>
              <button className={styles.button} type="button" onClick={() => void sendEvent("played")} disabled={loading}>
                遊んだ
              </button>
              <button className={styles.button} type="button" onClick={() => void sendEvent("blocked")} disabled={loading}>
                ブロック
              </button>
            </div>
            <div className={styles.row}>
              <select
                className={styles.select}
                value={dismissReason}
                onChange={(event) => setDismissReason(event.target.value)}
                disabled={loading}
              >
                {DISMISS_REASONS.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
              <button className={styles.button} type="button" onClick={() => void sendEvent("dismiss", dismissReason)} disabled={loading}>
                これ違う
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
