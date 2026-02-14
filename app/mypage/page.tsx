import { createClient } from "@/lib/supabase/server";
import { deleteInteractionAction, updateInteractionAction } from "@/app/mypage/actions";
import type { Interaction, InteractionAction } from "@/lib/types";

type Props = {
  searchParams: {
    action?: string;
    error?: string;
    message?: string;
  };
};

const FILTERS: Array<{ value: "all" | InteractionAction; label: string }> = [
  { value: "all", label: "すべて（shown除く）" },
  { value: "like", label: "好き" },
  { value: "played", label: "遊んだ" },
  { value: "not_now", label: "今はやめる" },
  { value: "dont_recommend", label: "今後おすすめしない" },
  { value: "shown", label: "表示済み" }
];

const ACTION_OPTIONS: Array<{ value: InteractionAction; label: string }> = [
  { value: "like", label: "好き" },
  { value: "played", label: "遊んだ" },
  { value: "not_now", label: "今はやめる" },
  { value: "dont_recommend", label: "今後おすすめしない" },
  { value: "shown", label: "表示済み" }
];

function toActionLabel(action: InteractionAction): string {
  return ACTION_OPTIONS.find((item) => item.value === action)?.label ?? action;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default async function MyPage({ searchParams }: Props) {
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
    .limit(200);

  if (selectedAction === "all") {
    query = query.neq("action", "shown");
  } else {
    query = query.eq("action", selectedAction);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as Interaction[];

  const returnTo = selectedAction === "all" ? "/mypage" : `/mypage?action=${selectedAction}`;

  return (
    <section className="stack">
      <h1>マイページ</h1>
      <p className="muted">自分で選んだ結果を管理できます。初期表示では「表示済み」は除外しています。</p>

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
          <p className="muted">該当する履歴がありません。</p>
        ) : (
          <div className="stack">
            {rows.map((item) => (
              <article key={item.id} className="listItem">
                <div className="stackCompact">
                  <h3>{item.game_title_snapshot || "タイトル未保存"}</h3>
                  <p className="chipLine">現在のアクション: {toActionLabel(item.action)}</p>
                  <p className="chipLine">外部ソース: {item.external_source || "なし"}</p>
                  <p className="chipLine">外部ゲームID: {item.external_game_id || "なし"}</p>
                  <p className="chipLine">日時: {formatDate(item.created_at)}</p>
                </div>
                <div className="stackCompact">
                  <form action={updateInteractionAction} className="rowWrap">
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="return_to" value={returnTo} />
                    <label className="field">
                      <span>アクション変更</span>
                      <select name="next_action" defaultValue={item.action}>
                        {ACTION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="submit" className="button">
                      変更を保存
                    </button>
                  </form>
                  <form action={deleteInteractionAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <input type="hidden" name="return_to" value={returnTo} />
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
