"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "@/app/components/mvp.module.css";

type Status = "played" | "wishlist" | "blocked";

type ListItem = {
  id: string;
  title: string;
  release_year: number | null;
  cover_url: string | null;
  genres: string[];
};

const TABS: Array<{ status: Status; label: string }> = [
  { status: "played", label: "遊んだ" },
  { status: "wishlist", label: "気になる" },
  { status: "blocked", label: "ブロック" }
];

export default function MylistMvp() {
  const [status, setStatus] = useState<Status>("played");
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const fetchList = useCallback(async (nextStatus: Status) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/mylist?status=${nextStatus}`, {
        method: "GET",
        cache: "no-store"
      });
      const body = (await response.json()) as { items?: ListItem[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "mylist_fetch_failed");
      setItems(body.items ?? []);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "mylist_fetch_failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList(status);
  }, [fetchList, status]);

  return (
    <div className={styles.stack}>
      <section className={styles.panel}>
        <h1 className={styles.title}>マイリスト</h1>
        <div className={styles.tabRow}>
          {TABS.map((tab) => (
            <button
              key={tab.status}
              type="button"
              className={`${styles.chip} ${status === tab.status ? styles.chipActive : ""}`}
              onClick={() => setStatus(tab.status)}
              disabled={loading}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}
      {loading ? <p className={styles.sub}>読み込み中...</p> : null}

      <section className={styles.list}>
        {items.length === 0 ? <p className={styles.empty}>まだ登録はありません。</p> : null}
        {items.map((item) => (
          <article key={item.id} className={styles.listItem}>
            <strong>{item.title}</strong>
            <span className={styles.sub}>
              {item.release_year ?? "年不明"} | {item.genres.join("・")}
            </span>
          </article>
        ))}
      </section>
    </div>
  );
}
