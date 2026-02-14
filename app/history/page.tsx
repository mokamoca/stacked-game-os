import { createClient } from "@/lib/supabase/server";
import type { Interaction, InteractionAction } from "@/lib/types";

type Props = {
  searchParams: {
    action?: string;
    error?: string;
    message?: string;
  };
};

const FILTERS: Array<{ value: "all" | InteractionAction; label: string }> = [
  { value: "all", label: "すべて" },
  { value: "like", label: "好き" },
  { value: "played", label: "遊んだ" },
  { value: "not_now", label: "今はやめる" },
  { value: "dont_recommend", label: "今後おすすめしない" },
  { value: "shown", label: "表示済み" }
];

function formatAction(action: InteractionAction): string {
  if (action === "like") return "好き";
  if (action === "played") return "遊んだ";
  if (action === "not_now") return "今はやめる";
  if (action === "dont_recommend") return "今後おすすめしない";
  return "表示済み";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default async function HistoryPage({ searchParams }: Props) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const selectedAction = FILTERS.some((item) => item.value === searchParams.action) ? searchParams.action ?? "all" : "all";

  let query = supabase
    .from("interactions")
    .select(
      "id,user_id,game_id,external_source,external_game_id,game_title_snapshot,action,time_bucket,context_tags,created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(150);

  if (selectedAction !== "all") {
    query = query.eq("action", selectedAction);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as Interaction[];

  return (
    <section className="stack">
      <h1>行動履歴</h1>
      <p className="muted">おすすめカードで選んだ結果を確認できます。外部ゲームIDと実行時のタイトルを保存しています。</p>

      {searchParams.message ? <p className="notice ok">{searchParams.message}</p> : null}
      {searchParams.error ? <p className="notice error">{searchParams.error}</p> : null}
      {error ? <p className="notice error">{error.message}</p> : null}

      <form method="GET" className="rowWrap">
        <label className="field">
          <span>アクション絞り込み</span>
          <select name="action" defaultValue={selectedAction}>
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
          <p className="muted">履歴はまだありません。</p>
        ) : (
          <div className="stack">
            {rows.map((item) => (
              <article key={item.id} className="listItem">
                <div className="stackCompact">
                  <h3>{item.game_title_snapshot || "タイトル未保存"}</h3>
                  <p className="chipLine">アクション: {formatAction(item.action)}</p>
                  <p className="chipLine">外部ソース: {item.external_source || "なし"}</p>
                  <p className="chipLine">外部ゲームID: {item.external_game_id || "なし"}</p>
                  <p className="chipLine">実行日時: {formatDate(item.created_at)}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
