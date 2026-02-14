import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { deleteGameAction } from "@/app/games/actions";
import type { Game } from "@/lib/types";

type Props = {
  searchParams: {
    message?: string;
    error?: string;
  };
};

export default async function GamesPage({ searchParams }: Props) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("games")
    .select("id,user_id,title,platform,tags,genre_tags,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const games = (data ?? []) as Game[];

  return (
    <section className="stack">
      <div className="rowBetween">
        <h1>ゲーム一覧</h1>
        <Link href="/games/new" className="button primary">
          追加
        </Link>
      </div>
      <p className="muted">この画面は任意のマイゲーム管理用です。おすすめ表示はダッシュボードで外部DBから取得します。</p>

      {searchParams.message ? <p className="notice ok">{searchParams.message}</p> : null}
      {searchParams.error ? <p className="notice error">{searchParams.error}</p> : null}
      {error ? <p className="notice error">{error.message}</p> : null}

      <div className="card">
        {games.length === 0 ? (
          <p className="muted">まだゲームがありません。</p>
        ) : (
          <div className="stack">
            {games.map((game) => (
              <article key={game.id} className="listItem">
                <div>
                  <h3>{game.title}</h3>
                  <p className="muted">{game.platform}</p>
                  <p className="chipLine">
                    気分: {Array.isArray(game.tags) && game.tags.length > 0 ? game.tags.join(", ") : "なし"}
                  </p>
                  <p className="chipLine">
                    ジャンル:{" "}
                    {Array.isArray(game.genre_tags) && game.genre_tags.length > 0 ? game.genre_tags.join(", ") : "なし"}
                  </p>
                </div>
                <div className="row">
                  <Link href={`/games/${game.id}/edit`} className="button">
                    編集
                  </Link>
                  <form action={deleteGameAction}>
                    <input type="hidden" name="id" value={game.id} />
                    <button type="submit" className="button danger">
                      削除
                    </button>
                  </form>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
