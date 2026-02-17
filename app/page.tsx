import { createClient } from "@/lib/supabase/server";
import {
  fetchExternalGames,
  getShownCooldownHours,
  rankExternalGames,
  rankPersonalizedExternalGames,
  type ExternalGame
} from "@/lib/external-games";
import { rerankWithAI } from "@/lib/ai-rerank";
import RecommendationCardList from "@/app/components/recommendation-card-list";
import FilterPanel from "@/app/components/ui/filter-panel";
import MetricsPanel from "@/app/components/ui/metrics-panel";
import styles from "@/app/components/ui/ui.module.css";
import type { Interaction, UserGameState } from "@/lib/types";

type SearchValue = string | string[] | undefined;

type Props = {
  searchParams: Record<string, SearchValue>;
};

const AI_CANDIDATE_LIMIT = 12;

const MOOD_PRESETS = [
  { key: "chill", label: "リラックス" },
  { key: "story", label: "ワクワク" },
  { key: "brain-off", label: "気軽" },
  { key: "hard", label: "アクション" },
  { key: "cozy", label: "癒やし" }
] as const;

const PLATFORM_OPTIONS = [
  { key: "pc", label: "PC" },
  { key: "playstation", label: "PlayStation" },
  { key: "switch", label: "Switch" },
  { key: "xbox", label: "Xbox" },
  { key: "mobile", label: "Mobile" }
] as const;

const GENRE_OPTIONS = [
  { key: "rpg", label: "RPG" },
  { key: "act", label: "ACT" },
  { key: "adv", label: "ADV" },
  { key: "slg", label: "SLG" },
  { key: "fps", label: "FPS" },
  { key: "indie", label: "INDIE" }
] as const;

function firstValue(raw: SearchValue): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0] ?? "";
  return "";
}

function toArray(raw: SearchValue): string[] {
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw;
  return [];
}

function normalizeSelected(raw: SearchValue, allowed: string[]): string[] {
  const allowSet = new Set(allowed);
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of toArray(raw)) {
    const item = value.trim().toLowerCase();
    if (!item || !allowSet.has(item) || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
}

function displayTitle(game: ExternalGame): string {
  return game.title_ja || game.title;
}

function gameKey(game: ExternalGame): string {
  return `${game.external_source}:${game.external_game_id}`;
}

function applyAiOrder(candidates: ExternalGame[], rankedIds: string[]): ExternalGame[] {
  const map = new Map(candidates.map((item) => [gameKey(item), item]));
  const ordered: ExternalGame[] = [];

  for (const id of rankedIds) {
    const item = map.get(id);
    if (!item) continue;
    ordered.push(item);
    map.delete(id);
  }

  for (const rest of candidates) {
    if (map.has(gameKey(rest))) ordered.push(rest);
  }

  return ordered;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function computeMetrics(interactions: Interaction[], states: UserGameState[]) {
  const shown = interactions.filter((item) => item.action === "shown").length;
  const likedCount = states.filter((item) => item.liked).length;
  const playedCount = states.filter((item) => item.played).length;
  const dontCount = states.filter((item) => item.dont_recommend).length;

  return {
    shown,
    likeRate: shown > 0 ? likedCount / shown : 0,
    playedRate: shown > 0 ? playedCount / shown : 0,
    dontRecommendRate: shown > 0 ? dontCount / shown : 0
  };
}

async function recordShownInteractions(params: {
  userId: string;
  recommendations: ExternalGame[];
  moodTags: string;
}) {
  const { userId, recommendations, moodTags } = params;
  if (recommendations.length === 0) return;

  const supabase = createClient();
  const toInsert = recommendations.map((game) => ({
    user_id: userId,
    game_id: null,
    external_source: game.external_source,
    external_game_id: game.external_game_id,
    game_title_snapshot: displayTitle(game),
    action: "shown",
    time_bucket: 30,
    context_tags: moodTags
  }));

  await supabase.from("interactions").insert(toInsert);
}

function statesByKey(states: UserGameState[]) {
  const map = new Map<string, UserGameState>();
  for (const state of states) {
    map.set(`${state.external_source}:${state.external_game_id}`, state);
  }
  return map;
}

function removePlayedOrBlocked(games: ExternalGame[], states: UserGameState[]): ExternalGame[] {
  const map = statesByKey(states);
  return games.filter((game) => {
    const state = map.get(gameKey(game));
    if (!state) return true;
    if (state.played) return false;
    if (state.dont_recommend) return false;
    if (state.disliked) return false;
    return true;
  });
}

export default async function DashboardPage({ searchParams }: Props) {
  const requestStart = Date.now();
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const moodPresetKeys = MOOD_PRESETS.map((item) => item.key);
  const platformKeys = PLATFORM_OPTIONS.map((item) => item.key);
  const genreKeys = GENRE_OPTIONS.map((item) => item.key);

  const selectedMoodPresets = normalizeSelected(searchParams.mood_preset, moodPresetKeys);
  const selectedPlatforms = normalizeSelected(searchParams.platform, platformKeys);
  const selectedGenres = normalizeSelected(searchParams.genre, genreKeys);

  const mood = selectedMoodPresets.join(", ");
  const message = firstValue(searchParams.message);
  const error = firstValue(searchParams.error);

  const dbStart = Date.now();
  const [{ data: interactionRows, error: interactionsError }, { data: stateRows, error: stateError }] = await Promise.all([
    supabase
      .from("interactions")
      .select(
        "id,user_id,game_id,external_source,external_game_id,game_title_snapshot,action,time_bucket,context_tags,created_at"
      )
      .eq("user_id", user.id),
    supabase
      .from("user_game_states")
      .select(
        "id,user_id,external_source,external_game_id,game_title_snapshot,liked,played,disliked,dont_recommend,created_at,updated_at"
      )
      .eq("user_id", user.id)
  ]);
  const dbMs = Date.now() - dbStart;

  const interactions = (interactionRows ?? []) as Interaction[];
  const gameStates = (stateRows ?? []) as UserGameState[];

  const externalStart = Date.now();
  const externalResult = await fetchExternalGames({
    platforms: selectedPlatforms,
    genres: selectedGenres
  });
  const externalMs = Date.now() - externalStart;

  const filteredCandidates = removePlayedOrBlocked(externalResult.games, gameStates);

  const personalizedBase = rankPersonalizedExternalGames({
    games: filteredCandidates,
    interactions,
    userStates: gameStates,
    limit: AI_CANDIDATE_LIMIT
  });
  const fallbackBase = rankExternalGames({
    games: filteredCandidates,
    interactions,
    userStates: gameStates,
    moodTags: selectedMoodPresets,
    limit: AI_CANDIDATE_LIMIT
  });

  const aiStart = Date.now();
  const [aiPersonalized, aiFallback] = await Promise.all([
    rerankWithAI({
      candidates: personalizedBase.map((game) => ({
        id: gameKey(game),
        title: displayTitle(game),
        platform: game.platform,
        genres: game.genre_tags,
        rating: game.rating,
        released: game.released
      })),
      moodPresets: selectedMoodPresets,
      platformFilters: selectedPlatforms,
      genreFilters: selectedGenres,
      userStates: gameStates,
      interactions
    }),
    rerankWithAI({
      candidates: fallbackBase.map((game) => ({
        id: gameKey(game),
        title: displayTitle(game),
        platform: game.platform,
        genres: game.genre_tags,
        rating: game.rating,
        released: game.released
      })),
      moodPresets: selectedMoodPresets,
      platformFilters: selectedPlatforms,
      genreFilters: selectedGenres,
      userStates: gameStates,
      interactions
    })
  ]);
  const aiMs = Date.now() - aiStart;

  const personalizedRecommendations = applyAiOrder(personalizedBase, aiPersonalized.rankedIds).slice(0, 3);

  const personalizedIds = new Set(personalizedRecommendations.map((item) => gameKey(item)));
  const fallbackRecommendations = applyAiOrder(fallbackBase, aiFallback.rankedIds)
    .filter((item) => !personalizedIds.has(gameKey(item)))
    .slice(0, 4);

  const shownInsertStart = Date.now();
  await recordShownInteractions({
    userId: user.id,
    recommendations: [...personalizedRecommendations, ...fallbackRecommendations],
    moodTags: mood
  });
  const shownInsertMs = Date.now() - shownInsertStart;

  const metrics = computeMetrics(interactions, gameStates);
  const aiWarning = aiPersonalized.error || aiFallback.error;

  const stateMap: Record<string, { liked: boolean; played: boolean; disliked: boolean; dont_recommend: boolean }> = {};
  for (const state of gameStates) {
    stateMap[`${state.external_source}:${state.external_game_id}`] = {
      liked: state.liked,
      played: state.played,
      disliked: state.disliked,
      dont_recommend: state.dont_recommend
    };
  }

  console.info(
    `[perf][dashboard] total=${Date.now() - requestStart}ms db=${dbMs}ms external=${externalMs}ms ai=${aiMs}ms shown_insert=${shownInsertMs}ms interactions=${interactions.length} states=${gameStates.length}`
  );

  return (
    <div className={styles.stack}>
      <FilterPanel
        moodOptions={[...MOOD_PRESETS]}
        platformOptions={[...PLATFORM_OPTIONS]}
        genreOptions={[...GENRE_OPTIONS]}
        selectedMoodPresets={selectedMoodPresets}
        selectedPlatforms={selectedPlatforms}
        selectedGenres={selectedGenres}
      />

      {message ? <p className={`${styles.notice} ${styles.ok}`}>{message}</p> : null}
      {error ? <p className={`${styles.notice} ${styles.error}`}>{error}</p> : null}
      {interactionsError ? <p className={`${styles.notice} ${styles.error}`}>{interactionsError.message}</p> : null}
      {stateError ? <p className={`${styles.notice} ${styles.error}`}>{stateError.message}</p> : null}
      {externalResult.error ? <p className={`${styles.notice} ${styles.error}`}>{externalResult.error}</p> : null}
      {aiWarning ? <p className={`${styles.notice} ${styles.error}`}>{aiWarning}</p> : null}

      <section className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <h2 className={styles.sectionTitle}>あなたへのおすすめ</h2>
        </div>
        {personalizedRecommendations.length === 0 ? (
          <p className={styles.muted}>未プレイ候補が見つかりませんでした。条件をゆるめて再実行してください。</p>
        ) : (
          <RecommendationCardList
            games={personalizedRecommendations}
            aiReasons={aiPersonalized.reasons}
            initialStates={stateMap}
          />
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitleRow}>
          <h2 className={styles.sectionTitle}>追加候補</h2>
        </div>
        {fallbackRecommendations.length === 0 ? (
          <p className={styles.muted}>追加候補はありません。</p>
        ) : (
          <RecommendationCardList
            games={fallbackRecommendations}
            aiReasons={aiFallback.reasons}
            initialStates={stateMap}
          />
        )}
      </section>

      <MetricsPanel
        metrics={{
          shown: metrics.shown,
          likeRate: formatPercent(metrics.likeRate),
          playedRate: formatPercent(metrics.playedRate),
          dontRecommendRate: formatPercent(metrics.dontRecommendRate)
        }}
        cooldownHours={getShownCooldownHours()}
      />
    </div>
  );
}
