import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Game } from "@/lib/types";
import { interactionAction } from "@/app/dashboard-actions";

type Props = {
  searchParams: {
    mood?: string;
    time?: string;
    message?: string;
    error?: string;
  };
};

async function recordShownInteractions(params: {
  userId: string;
  gameIds: string[];
  timeBucket: number;
  moodTags: string;
}) {
  const { userId, gameIds, timeBucket, moodTags } = params;
  if (gameIds.length === 0) return;

  const supabase = createClient();
  const toInsert = gameIds.map((gameId) => ({
    user_id: userId,
    game_id: gameId,
    action: "shown",
    time_bucket: timeBucket,
    context_tags: moodTags
  }));

  // Non-blocking: shown logging must not break dashboard rendering.
  await supabase.from("interactions").insert(toInsert);
}

function parseTimeBucket(raw?: string): number {
  const value = Number(raw);
  if ([15, 30, 60, 120].includes(value)) return value;
  return 30;
}

export default async function DashboardPage({ searchParams }: Props) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const mood = (searchParams.mood ?? "").trim();
  const timeBucket = parseTimeBucket(searchParams.time);

  const { count: gamesCount, error: gamesError } = await supabase
    .from("games")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const { data: recommendedData, error: recommendedError } = await supabase.rpc(
    "recommend_games",
    {
      p_mood_tags: mood,
      p_limit: 3
    }
  );

  const recommendations = (recommendedData ?? []) as Game[];

  await recordShownInteractions({
    userId: user.id,
    gameIds: recommendations.map((item) => item.id),
    timeBucket,
    moodTags: mood
  });

  const returnTo = mood || searchParams.time ? `/?mood=${encodeURIComponent(mood)}&time=${timeBucket}` : "/";

  return (
    <div className="stack">
      <section className="card">
        <h1>今日の1本を決める</h1>
        <p className="muted">気分タグとプレイ時間から、今日のおすすめを最大3本選びます。</p>

        {searchParams.message ? <p className="notice ok">{searchParams.message}</p> : null}
        {searchParams.error ? <p className="notice error">{searchParams.error}</p> : null}
        {gamesError ? <p className="notice error">{gamesError.message}</p> : null}
        {recommendedError ? <p className="notice error">{recommendedError.message}</p> : null}

        <form method="GET" className="rowWrap">
          <label className="field grow">
            <span>今日の気分タグ (任意)</span>
            <input name="mood" defaultValue={mood} placeholder="chill, story, brain-off" />
          </label>

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
        {(gamesCount ?? 0) === 0 ? (
          <p className="muted">
            ゲームが未登録です。<Link href="/games/new">/games/new</Link> から追加してください。
          </p>
        ) : recommendations.length === 0 ? (
          <p className="muted">おすすめ対象がありません（dont_recommend設定済みの可能性があります）。</p>
        ) : (
          <div className="grid">
            {recommendations.map((game) => (
              <article key={game.id} className="card">
                <h3>{game.title}</h3>
                <p className="muted">{game.platform}</p>
                <p className="chipLine">
                  tags: {Array.isArray(game.tags) && game.tags.length > 0 ? game.tags.join(", ") : "なし"}
                </p>

                <div className="actionsGrid">
                  {[
                    { action: "like", label: "Like" },
                    { action: "played", label: "Played" },
                    { action: "not_now", label: "Not now" },
                    { action: "dont_recommend", label: "Don't recommend" }
                  ].map((entry) => (
                    <form key={entry.action} action={interactionAction}>
                      <input type="hidden" name="game_id" value={game.id} />
                      <input type="hidden" name="action" value={entry.action} />
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
