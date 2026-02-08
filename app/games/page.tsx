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
    .select("id,user_id,title,platform,tags,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const games = (data ?? []) as Game[];

  return (
    <section className="stack">
      <div className="rowBetween">
        <h1>Games</h1>
        <Link href="/games/new" className="button primary">
          Add game
        </Link>
      </div>

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
                    tags: {Array.isArray(game.tags) && game.tags.length > 0 ? game.tags.join(", ") : "なし"}
                  </p>
                </div>
                <div className="row">
                  <Link href={`/games/${game.id}/edit`} className="button">
                    Edit
                  </Link>
                  <form action={deleteGameAction}>
                    <input type="hidden" name="id" value={game.id} />
                    <button type="submit" className="button danger">
                      Delete
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
