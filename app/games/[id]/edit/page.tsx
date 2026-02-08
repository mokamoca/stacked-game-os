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
    .select("id,title,platform,tags")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return <p className="notice error">{error.message}</p>;
  }

  if (!game) {
    notFound();
  }

  const tagText = Array.isArray(game.tags) ? game.tags.join(", ") : "";

  return (
    <section className="card narrow">
      <h1>Edit game</h1>
      {searchParams.error ? <p className="notice error">{searchParams.error}</p> : null}
      <form action={updateGameAction} className="stack">
        <input type="hidden" name="id" value={game.id} />

        <label className="field">
          <span>Title</span>
          <input name="title" defaultValue={game.title} required />
        </label>

        <label className="field">
          <span>Platform</span>
          <input name="platform" defaultValue={game.platform} required />
        </label>

        <label className="field">
          <span>Mood tags</span>
          <input name="tags" defaultValue={tagText} />
        </label>

        <div className="row">
          <button type="submit" className="button primary">
            Update
          </button>
          <Link href="/games" className="button">
            Back
          </Link>
        </div>
      </form>
    </section>
  );
}
