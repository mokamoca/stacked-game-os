import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { updateGameAction } from "@/app/games/actions";

type Props = {
  params: {
    id: string;
  };
  searchParams: {
    error?: string;
  };
};

export default async function EditGamePage({ params, searchParams }: Props) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: game, error } = await supabase
    .from("games")
    .select("id,title,platform,tags,genre_tags")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return <p className="notice error">{error.message}</p>;
  }

  if (!game) {
    notFound();
  }

  const genreTagText = Array.isArray(game.genre_tags) ? game.genre_tags.join(", ") : "";

  return (
    <section className="card narrow">
      <h1>ゲームを編集</h1>
      {searchParams.error ? <p className="notice error">{searchParams.error}</p> : null}
      <form action={updateGameAction} className="stack">
        <input type="hidden" name="id" value={game.id} />

        <label className="field">
          <span>タイトル</span>
          <input name="title" defaultValue={game.title} required />
        </label>

        <label className="field">
          <span>プラットフォーム（カンマ区切りで複数可）</span>
          <input name="platform" defaultValue={game.platform} required />
        </label>

        <label className="field">
          <span>ジャンルタグ</span>
          <input name="genre_tags" defaultValue={genreTagText} />
        </label>

        <div className="row">
          <button type="submit" className="button primary">
            更新
          </button>
          <Link href="/games" className="button">
            戻る
          </Link>
        </div>
      </form>
    </section>
  );
}
