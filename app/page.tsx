import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { interactionAction } from "@/app/dashboard-actions";
import {
  fetchExternalGames,
  rankExternalGames,
  rankPersonalizedExternalGames,
  type ExternalGame
} from "@/lib/external-games";
import { rerankWithAI } from "@/lib/ai-rerank";
import type { Interaction } from "@/lib/types";

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

function formatReleaseDate(raw: string): string {
  if (!raw) return "不明";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "不明";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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

function computeMetrics(interactions: Interaction[]) {
  const shown = interactions.filter((item) => item.action === "shown").length;
  const like = interactions.filter((item) => item.action === "like").length;
  const played = interactions.filter((item) => item.action === "played").length;
  const dontRecommend = interactions.filter((item) => item.action === "dont_recommend").length;

  return {
    shown,
    likeRate: shown > 0 ? like / shown : 0,
    playedRate: shown > 0 ? played / shown : 0,
    dontRecommendRate: shown > 0 ? dontRecommend / shown : 0
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

function GameCard(params: {
  game: ExternalGame;
  mood: string;
  returnTo: string;
  aiReason?: string;
}) {
  const { game, mood, returnTo, aiReason } = params;
  return (
    <article key={gameKey(game)} className="gameCard">
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
        {aiReason ? <p className="aiReason">AI理由: {aiReason}</p> : null}
      </div>

      <div className="actionsGrid">
        {[
          { action: "like", label: "好き" },
          { action: "played", label: "遊んだ" },
          { action: "not_now", label: "今はやめる" },
          { action: "dont_recommend", label: "今後おすすめしない" }
        ].map((entry) => (
          <form key={entry.action} action={interactionAction}>
            <input type="hidden" name="action" value={entry.action} />
            <input type="hidden" name="external_source" value={game.external_source} />
            <input type="hidden" name="external_game_id" value={game.external_game_id} />
            <input type="hidden" name="game_title_snapshot" value={displayTitle(game)} />
            <input type="hidden" name="context_tags" value={mood} />
            <input type="hidden" name="return_to" value={returnTo} />
            <button type="submit" className="button">
              {entry.label}
            </button>
          </form>
        ))}
      </div>
    </article>
  );
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

  const { data: interactionRows, error: interactionsError } = await supabase
    .from("interactions")
    .select(
      "id,user_id,game_id,external_source,external_game_id,game_title_snapshot,action,time_bucket,context_tags,created_at"
    )
    .eq("user_id", user.id);

  const interactions = (interactionRows ?? []) as Interaction[];

  const externalResult = await fetchExternalGames({
    platforms: selectedPlatforms,
    genres: selectedGenres
  });

  const personalizedBase = rankPersonalizedExternalGames({
    games: externalResult.games,
    interactions,
    limit: 15
  });
  const fallbackBase = rankExternalGames({
    games: externalResult.games,
    interactions,
    moodTags: selectedMoodPresets,
    limit: 15
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

  const metrics = computeMetrics(interactions);
  const aiWarning = aiPersonalized.error || aiFallback.error;

  return (
    <div className="stack">
      <section className="hero card">
        <div>
          <h1>今日の1本を決める</h1>
          <p className="muted">今の気分と行動履歴から、今日の候補を提案します。</p>
        </div>

        {message ? <p className="notice ok">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}
        {interactionsError ? <p className="notice error">{interactionsError.message}</p> : null}
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
          <p className="muted">行動履歴が増えると、ここに個人化された候補が表示されます。</p>
        ) : (
          <div className="grid">
            {personalizedRecommendations.map((game) =>
              GameCard({ game, mood, returnTo, aiReason: aiPersonalized.reasons[gameKey(game)] })
            )}
          </div>
        )}
      </section>

      <section>
        <h2>今日のおすすめ</h2>
        {fallbackRecommendations.length === 0 ? (
          <p className="muted">候補が見つかりませんでした。フィルタ条件を緩めて再実行してください。</p>
        ) : (
          <div className="grid">
            {fallbackRecommendations.map((game) =>
              GameCard({ game, mood, returnTo, aiReason: aiFallback.reasons[gameKey(game)] })
            )}
          </div>
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
