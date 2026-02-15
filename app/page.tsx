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
import { upsertGameStateAction } from "@/app/state-actions";
import type { Interaction, UserGameState } from "@/lib/types";

type SearchValue = string | string[] | undefined;

type Props = {
  searchParams: Record<string, SearchValue>;
};

const MOOD_PRESETS = [
  { key: "chill", label: "まったり" },
  { key: "story", label: "ストーリー重視" },
  { key: "brain-off", label: "頭を空っぽで遊ぶ" },
  { key: "hard", label: "歯ごたえ重視" },
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
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const moodPresetKeys = MOOD_PRESETS.map((item) => item.key);
  const platformKeys = PLATFORM_OPTIONS.map((item) => item.key);
  const genreKeys = GENRE_OPTIONS.map((item) => item.key);

  const selectedMoodPresets = normalizeSelected(searchParams.mood_preset, moodPresetKeys);
  const selectedPlatforms = normalizeSelected(searchParams.platform, platformKeys);
  const selectedGenres = normalizeSelected(searchParams.genre, genreKeys);

  const mood = selectedMoodPresets.join(", ");
  const message = firstValue(searchParams.message);
  const error = firstValue(searchParams.error);

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

  const interactions = (interactionRows ?? []) as Interaction[];
  const gameStates = (stateRows ?? []) as UserGameState[];

  const externalResult = await fetchExternalGames({
    platforms: selectedPlatforms,
    genres: selectedGenres
  });

  const filteredCandidates = removePlayedOrBlocked(externalResult.games, gameStates);

  const personalizedBase = rankPersonalizedExternalGames({
    games: filteredCandidates,
    interactions,
    userStates: gameStates,
    limit: 18
  });
  const fallbackBase = rankExternalGames({
    games: filteredCandidates,
    interactions,
    userStates: gameStates,
    moodTags: selectedMoodPresets,
    limit: 18
  });

  const aiPersonalized = await rerankWithAI({
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
  });

  const aiFallback = await rerankWithAI({
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
  });

  const personalizedRecommendations = applyAiOrder(personalizedBase, aiPersonalized.rankedIds).slice(0, 3);

  const personalizedIds = new Set(personalizedRecommendations.map((item) => gameKey(item)));
  const fallbackRecommendations = applyAiOrder(fallbackBase, aiFallback.rankedIds)
    .filter((item) => !personalizedIds.has(gameKey(item)))
    .slice(0, 3);

  await recordShownInteractions({
    userId: user.id,
    recommendations: [...personalizedRecommendations, ...fallbackRecommendations],
    moodTags: mood
  });

  const returnParams = new URLSearchParams();
  for (const preset of selectedMoodPresets) returnParams.append("mood_preset", preset);
  for (const platform of selectedPlatforms) returnParams.append("platform", platform);
  for (const genre of selectedGenres) returnParams.append("genre", genre);
  const returnTo = returnParams.toString() ? `/?${returnParams.toString()}` : "/";

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

  return (
    <div className="stack">
      <section className="hero card">
        <div>
          <h1>今日の1本を決める</h1>
          <p className="muted">次に遊ぶ未プレイ候補を優先して提案します。</p>
          <p className="muted">遊んだ / おすすめしない / 嫌いにしたゲームは原則除外されます。</p>
          <p className="muted">同一タイトルの表示は {getShownCooldownHours()} 時間クールダウンで抑制します。</p>
        </div>

        {message ? <p className="notice ok">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}
        {interactionsError ? <p className="notice error">{interactionsError.message}</p> : null}
        {stateError ? <p className="notice error">{stateError.message}</p> : null}
        {externalResult.error ? <p className="notice error">{externalResult.error}</p> : null}
        {aiWarning ? <p className="notice error">{aiWarning}</p> : null}

        <form method="GET" className="rowWrap">
          <fieldset className="checkGroup grow">
            <legend>気分プリセット（複数選択）</legend>
            <div className="checkList">
              {MOOD_PRESETS.map((item) => (
                <label key={item.key} className="checkItem">
                  <input
                    type="checkbox"
                    name="mood_preset"
                    value={item.key}
                    defaultChecked={selectedMoodPresets.includes(item.key)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="checkGroup">
            <legend>プラットフォーム</legend>
            <div className="checkList">
              {PLATFORM_OPTIONS.map((item) => (
                <label key={item.key} className="checkItem">
                  <input
                    type="checkbox"
                    name="platform"
                    value={item.key}
                    defaultChecked={selectedPlatforms.includes(item.key)}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="checkGroup">
            <legend>ジャンル</legend>
            <div className="checkList">
              {GENRE_OPTIONS.map((item) => (
                <label key={item.key} className="checkItem">
                  <input type="checkbox" name="genre" value={item.key} defaultChecked={selectedGenres.includes(item.key)} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="submit" className="button primary alignEnd">
            更新
          </button>
        </form>
      </section>

      <section>
        <h2>あなたへのおすすめ（行動ベース）</h2>
        {personalizedRecommendations.length === 0 ? (
          <p className="muted">ゲーム棚の状態に合う未プレイ候補が見つかりませんでした。</p>
        ) : (
          <RecommendationCardList
            games={personalizedRecommendations}
            returnTo={returnTo}
            aiReasons={aiPersonalized.reasons}
            initialStates={stateMap}
            upsertAction={upsertGameStateAction}
          />
        )}
      </section>

      <section>
        <h2>追加候補</h2>
        {fallbackRecommendations.length === 0 ? (
          <p className="muted">追加候補はありません。フィルタ条件を緩めてください。</p>
        ) : (
          <RecommendationCardList
            games={fallbackRecommendations}
            returnTo={returnTo}
            aiReasons={aiFallback.reasons}
            initialStates={stateMap}
            upsertAction={upsertGameStateAction}
          />
        )}
      </section>

      <section className="card">
        <h2>推薦指標（全期間）</h2>
        <div className="metricGrid">
          <article className="metricCard">
            <span className="metricLabel">表示数（shown）</span>
            <strong>{metrics.shown}</strong>
          </article>
          <article className="metricCard">
            <span className="metricLabel">like率</span>
            <strong>{formatPercent(metrics.likeRate)}</strong>
          </article>
          <article className="metricCard">
            <span className="metricLabel">played率</span>
            <strong>{formatPercent(metrics.playedRate)}</strong>
          </article>
          <article className="metricCard">
            <span className="metricLabel">dont_recommend率</span>
            <strong>{formatPercent(metrics.dontRecommendRate)}</strong>
          </article>
        </div>
      </section>
    </div>
  );
}
