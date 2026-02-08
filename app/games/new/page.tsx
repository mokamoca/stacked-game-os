import Link from "next/link";
import { createGameAction } from "@/app/games/actions";

type Props = {
  searchParams: {
    error?: string;
  };
};

export default function NewGamePage({ searchParams }: Props) {
  return (
    <section className="card narrow">
      <h1>Add game</h1>
      {searchParams.error ? <p className="notice error">{searchParams.error}</p> : null}
      <form action={createGameAction} className="stack">
        <label className="field">
          <span>Title</span>
          <input name="title" required />
        </label>

        <label className="field">
          <span>Platform</span>
          <input name="platform" required placeholder="Steam / PS5 / Switch ..." />
        </label>

        <label className="field">
          <span>Mood tags</span>
          <input name="mood_tags" placeholder="chill, story, brain-off" />
        </label>

        <div className="row">
          <button type="submit" className="button primary">
            Save
          </button>
          <Link href="/games" className="button">
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
