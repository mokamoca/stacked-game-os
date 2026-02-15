import styles from "@/app/components/ui/ui.module.css";

type Metrics = {
  shown: number;
  likeRate: string;
  playedRate: string;
  dontRecommendRate: string;
};

type Props = {
  metrics: Metrics;
  cooldownHours: number;
};

export default function MetricsPanel({ metrics, cooldownHours }: Props) {
  return (
    <section className={`${styles.card} ${styles.metricsPanel}`}>
      <div className={styles.sectionTitleRow}>
        <h2 className={styles.sectionTitle}>推薦指標</h2>
      </div>
      <div className={styles.metricsGrid}>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>表示数</span>
          <strong className={styles.metricValue}>{metrics.shown}</strong>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Like率</span>
          <strong className={styles.metricValue}>{metrics.likeRate}</strong>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>Played率</span>
          <strong className={styles.metricValue}>{metrics.playedRate}</strong>
        </article>
        <article className={styles.metricCard}>
          <span className={styles.metricLabel}>非推奨率</span>
          <strong className={styles.metricValue}>{metrics.dontRecommendRate}</strong>
        </article>
      </div>
      <p className={styles.muted}>同一タイトルの表示は {cooldownHours} 時間クールダウンしています。</p>
    </section>
  );
}
