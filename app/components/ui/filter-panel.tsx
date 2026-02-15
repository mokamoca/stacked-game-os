import styles from "@/app/components/ui/ui.module.css";

type Option = {
  key: string;
  label: string;
};

type Props = {
  moodOptions: Option[];
  platformOptions: Option[];
  genreOptions: Option[];
  selectedMoodPresets: string[];
  selectedPlatforms: string[];
  selectedGenres: string[];
};

export default function FilterPanel({
  moodOptions,
  platformOptions,
  genreOptions,
  selectedMoodPresets,
  selectedPlatforms,
  selectedGenres
}: Props) {
  return (
    <section className={`${styles.card} ${styles.filterPanel}`}>
      <form method="GET" className={styles.filterForm}>
        <div className={styles.filterBlock}>
          <p className={styles.filterTitle}>気分</p>
          <div className={styles.chips}>
            {moodOptions.map((item) => (
              <label key={item.key} className={styles.chip}>
                <input
                  type="checkbox"
                  name="mood_preset"
                  value={item.key}
                  defaultChecked={selectedMoodPresets.includes(item.key)}
                />
                <span className={styles.chipLabel}>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.filterBlock}>
          <p className={styles.filterTitle}>プラットフォーム</p>
          <div className={styles.chips}>
            {platformOptions.map((item) => (
              <label key={item.key} className={styles.chip}>
                <input
                  type="checkbox"
                  name="platform"
                  value={item.key}
                  defaultChecked={selectedPlatforms.includes(item.key)}
                />
                <span className={styles.chipLabel}>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.filterBlock}>
          <p className={styles.filterTitle}>ジャンル</p>
          <div className={styles.chips}>
            {genreOptions.map((item) => (
              <label key={item.key} className={styles.chip}>
                <input
                  type="checkbox"
                  name="genre"
                  value={item.key}
                  defaultChecked={selectedGenres.includes(item.key)}
                />
                <span className={styles.chipLabel}>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}>
          更新
        </button>
      </form>
    </section>
  );
}
