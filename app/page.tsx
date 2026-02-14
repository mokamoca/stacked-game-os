import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { interactionAction } from "@/app/dashboard-actions";
import { fetchExternalGames, rankExternalGames, type ExternalGame } from "@/lib/external-games";
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

function parseTimeBucket(raw?: string): number {
  const value = Number(raw);
  if ([15, 30, 60, 120].includes(value)) return value;
  return 30;
}

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

async function recordShownInteractions(params: {
  userId: string;
  recommendations: ExternalGame[];
  timeBucket: number;
  moodTags: string;
}) {
  const { userId, recommendations, timeBucket, moodTags } = params;
  if (recommendations.length === 0) return;

  const supabase = createClient();
  const toInsert = recommendations.map((game) => ({
    user_id: userId,
    game_id: null,
    external_source: game.external_source,
    external_game_id: game.external_game_id,
    game_title_snapshot: game.title,
    action: "shown",
    time_bucket: timeBucket,
    context_tags: moodTags
  }));

  await supabase.from("interactions").insert(toInsert);
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
  const timeBucket = parseTimeBucket(firstValue(searchParams.time));
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

  const recommendations = rankExternalGames({
    games: externalResult.games,
    interactions,
    moodTags: selectedMoodPresets,
    limit: 3
  });

  await recordShownInteractions({
    userId: user.id,
    recommendations,
    timeBucket,
    moodTags: mood
  });

  const returnParams = new URLSearchParams();
  for (const preset of selectedMoodPresets) returnParams.append("mood_preset", preset);
  for (const platform of selectedPlatforms) returnParams.append("platform", platform);
  for (const genre of selectedGenres) returnParams.append("genre", genre);
  if (timeBucket !== 30 || returnParams.toString()) returnParams.set("time", String(timeBucket));
  const returnTo = returnParams.toString() ? `/?${returnParams.toString()}` : "/";

  return (
    <div className="stack">
      <section className="card">
        <h1>今日の1本を決める</h1>
        <p className="muted">外部ゲームDBから候補を取得し、気分・プラットフォーム・ジャンル・時間でおすすめを最大3本表示します。</p>

        {message ? <p className="notice ok">{message}</p> : null}
        {error ? <p className="notice error">{error}</p> : null}
        {interactionsError ? <p className="notice error">{interactionsError.message}</p> : null}
        {externalResult.error ? <p className="notice error">{externalResult.error}</p> : null}

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
            <legend>プラットフォーム（複数選択）</legend>
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
            <legend>ジャンル（複数選択）</legend>
            <div className="checkList">
              {GENRE_OPTIONS.map((item) => (
                <label key={item.key} className="checkItem">
                  <input type="checkbox" name="genre" value={item.key} defaultChecked={selectedGenres.includes(item.key)} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <label className="field">
            <span>遊べる時間</span>
            <select name="time" defaultValue={String(timeBucket)}>
              <option value="15">15分</option>
              <option value="30">30分</option>
              <option value="60">60分</option>
              <option value="120">120分</option>
            </select>
          </label>

          <button type="submit" className="button primary alignEnd">
            更新
          </button>
        </form>
      </section>

      <section>
        <h2>今日のおすすめ</h2>
        {recommendations.length === 0 ? (
          <p className="muted">候補が見つかりませんでした。フィルタ条件を緩めて再実行してください。</p>
        ) : (
          <div className="grid">
            {recommendations.map((game) => (
              <article key={`${game.external_source}-${game.external_game_id}`} className="card">
                {game.image_url ? (
                  <Image src={game.image_url} alt={game.title} width={640} height={360} className="gameImage" />
                ) : null}
                <h3>{game.title}</h3>
                <p className="muted">{game.platform}</p>
                <p className="chipLine">ジャンル: {game.genre_tags.length > 0 ? game.genre_tags.join(", ") : "なし"}</p>

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
                      <input type="hidden" name="game_title_snapshot" value={game.title} />
                      <input type="hidden" name="time_bucket" value={String(timeBucket)} />
                      <input type="hidden" name="context_tags" value={mood} />
                      <input type="hidden" name="return_to" value={returnTo} />
                      <button type="submit" className="button">
                        {entry.label}
                      </button>
                    </form>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
