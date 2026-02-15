import { createClient } from "@/lib/supabase/server";
import { deleteGameStateByIdAction, updateGameStateByIdAction } from "@/app/state-actions";
import type { UserGameState } from "@/lib/types";

type Props = {
  searchParams: {
    filter?: string;
    error?: string;
    message?: string;
  };
};

const FILTERS = [
  { value: "all", label: "すべて" },
  { value: "liked", label: "好き" },
  { value: "played", label: "遊んだ" },
  { value: "disliked", label: "嫌い" },
  { value: "dont_recommend", label: "おすすめしない" }
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isFilter(value: string): value is FilterValue {
  return FILTERS.some((item) => item.value === value);
}

export default async function MyPage({ searchParams }: Props) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const selectedFilter: FilterValue = isFilter(searchParams.filter ?? "") ? (searchParams.filter as FilterValue) : "all";

  let query = supabase
    .from("user_game_states")
    .select(
      "id,user_id,external_source,external_game_id,game_title_snapshot,liked,played,disliked,dont_recommend,created_at,updated_at"
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(300);

  if (selectedFilter !== "all") {
    query = query.eq(selectedFilter, true);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as UserGameState[];

  const returnTo = selectedFilter === "all" ? "/mypage" : `/mypage?filter=${selectedFilter}`;

  return (
    <section className="stack">
      <h1>マイページ（ゲーム棚）</h1>
      <p className="muted">同じゲームは1行で管理します。状態を編集すると棚が更新されます。</p>

      {searchParams.message ? <p className="notice ok">{searchParams.message}</p> : null}
      {searchParams.error ? <p className="notice error">{searchParams.error}</p> : null}
      {error ? <p className="notice error">{error.message}</p> : null}

      <form method="GET" className="rowWrap">
        <label className="field">
          <span>表示フィルタ</span>
          <select name="filter" defaultValue={selectedFilter}>
            {FILTERS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="button primary alignEnd">
          反映
        </button>
      </form>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">該当するゲームがありません。</p>
        ) : (
          <div className="stack">
            {rows.map((item) => (
              <article key={item.id} className="listItem">
                <div className="stackCompact">
                  <h3>{item.game_title_snapshot || "タイトル未保存"}</h3>
                  <p className="chipLine">好き: {item.liked ? "ON" : "OFF"}</p>
                  <p className="chipLine">遊んだ: {item.played ? "ON" : "OFF"}</p>
                  <p className="chipLine">嫌い: {item.disliked ? "ON" : "OFF"}</p>
                  <p className="chipLine">おすすめしない: {item.dont_recommend ? "ON" : "OFF"}</p>
                  <p className="chipLine">最終更新: {formatDate(item.updated_at)}</p>
                </div>

                <div className="stackCompact">
                  <form action={updateGameStateByIdAction} className="rowWrap">
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="return_to" value={returnTo} />

                    <label className="checkItem">
                      <input type="checkbox" name="liked" defaultChecked={item.liked} />
                      <span>好き</span>
                    </label>
                    <label className="checkItem">
                      <input type="checkbox" name="played" defaultChecked={item.played} />
                      <span>遊んだ</span>
                    </label>
                    <label className="checkItem">
                      <input type="checkbox" name="disliked" defaultChecked={item.disliked} />
                      <span>嫌い</span>
                    </label>
                    <label className="checkItem">
                      <input type="checkbox" name="dont_recommend" defaultChecked={item.dont_recommend} />
                      <span>おすすめしない</span>
                    </label>

                    <button type="submit" className="button">
                      状態を保存
                    </button>
                  </form>

                  <form action={deleteGameStateByIdAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <button type="submit" className="button danger">
                      ゲーム棚から削除
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
