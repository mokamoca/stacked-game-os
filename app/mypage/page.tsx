import { createClient } from "@/lib/supabase/server";
import { deleteGameStateByIdAction, updateGameStateByIdAction } from "@/app/state-actions";
import ShelfTable from "@/app/components/ui/shelf-table";
import styles from "@/app/components/ui/ui.module.css";
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
    <section className={styles.stack}>
      <div className={styles.sectionTitleRow}>
        <h1 className={styles.sectionTitle}>マイページ</h1>
      </div>

      {searchParams.message ? <p className={`${styles.notice} ${styles.ok}`}>{searchParams.message}</p> : null}
      {searchParams.error ? <p className={`${styles.notice} ${styles.error}`}>{searchParams.error}</p> : null}
      {error ? <p className={`${styles.notice} ${styles.error}`}>{error.message}</p> : null}

      <ShelfTable
        rows={rows}
        filters={FILTERS.map((item) => ({ ...item }))}
        selectedFilter={selectedFilter}
        returnTo={returnTo}
        updateAction={updateGameStateByIdAction}
        deleteAction={deleteGameStateByIdAction}
      />
    </section>
  );
}
