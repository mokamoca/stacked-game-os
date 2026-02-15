import styles from "@/app/components/ui/ui.module.css";
import type { UserGameState } from "@/lib/types";

type FilterItem = {
  value: string;
  label: string;
};

type Props = {
  rows: UserGameState[];
  filters: FilterItem[];
  selectedFilter: string;
  returnTo: string;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function ShelfTable({ rows, filters, selectedFilter, returnTo, updateAction, deleteAction }: Props) {
  return (
    <section className={`${styles.card} ${styles.shelfPanel}`}>
      <form method="GET" className={styles.filterTabs}>
        {filters.map((item) => (
          <button
            key={item.value}
            type="submit"
            name="filter"
            value={item.value}
            className={`${styles.tab} ${selectedFilter === item.value ? styles.tabActive : ""}`}
          >
            {item.label}
          </button>
        ))}
      </form>

      <div className={styles.shelfTable}>
        <header className={styles.shelfHead}>
          <span>タイトル</span>
          <span>状態</span>
          <span>更新日</span>
          <span>操作</span>
        </header>

        {rows.length === 0 ? (
          <p className={styles.muted} style={{ padding: "0.8rem" }}>
            ゲーム棚はまだ空です。
          </p>
        ) : (
          rows.map((item) => (
            <article key={item.id} className={styles.shelfRow}>
              <div className={styles.shelfTitle}>{item.game_title_snapshot || "タイトル未保存"}</div>

              <form action={updateAction} className={styles.shelfStateForm}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="return_to" value={returnTo} />

                <label className={styles.mini}>
                  <input type="checkbox" name="liked" defaultChecked={item.liked} />
                  <span className={styles.miniLabel}>好き</span>
                </label>
                <label className={styles.mini}>
                  <input type="checkbox" name="played" defaultChecked={item.played} />
                  <span className={styles.miniLabel}>遊んだ</span>
                </label>
                <label className={styles.mini}>
                  <input type="checkbox" name="disliked" defaultChecked={item.disliked} />
                  <span className={styles.miniLabel}>嫌い</span>
                </label>
                <label className={styles.mini}>
                  <input type="checkbox" name="dont_recommend" defaultChecked={item.dont_recommend} />
                  <span className={styles.miniLabel}>おすすめしない</span>
                </label>

                <button type="submit" className={styles.button}>
                  反映
                </button>
              </form>

              <div className={styles.muted}>{formatDate(item.updated_at)}</div>

              <form action={deleteAction}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="return_to" value={returnTo} />
                <button type="submit" className={styles.deleteButton}>
                  削除
                </button>
              </form>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
