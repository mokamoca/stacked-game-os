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
      <h1>ゲームを追加</h1>
      <p className="muted">おすすめ機能の利用にゲーム登録は不要です。ここは任意のマイゲーム管理用です。</p>
      {searchParams.error ? <p className="notice error">{searchParams.error}</p> : null}
      <form action={createGameAction} className="stack">
        <label className="field">
          <span>タイトル</span>
          <input name="title" required />
        </label>

        <label className="field">
          <span>プラットフォーム（カンマ区切りで複数可）</span>
          <input name="platform" required placeholder="PC, PlayStation, Switch" />
        </label>

        <label className="field">
          <span>ジャンルタグ</span>
          <input name="genre_tags" placeholder="rpg, act, adv" />
        </label>

        <div className="row">
          <button type="submit" className="button primary">
            保存
          </button>
          <Link href="/games" className="button">
            キャンセル
          </Link>
        </div>
      </form>
    </section>
  );
}
