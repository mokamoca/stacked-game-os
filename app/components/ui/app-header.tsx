import Link from "next/link";
import styles from "@/app/components/ui/ui.module.css";

type Props = {
  isAuthenticated: boolean;
};

export default function AppHeader({ isAuthenticated }: Props) {
  return (
    <header className={styles.header}>
      <div className={`${styles.container} ${styles.headerInner}`}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} aria-hidden>
            SG
          </span>
          <span>STACKED GAME OS</span>
        </Link>
        <nav className={styles.nav}>
          {isAuthenticated ? (
            <>
              <Link className={styles.navLink} href="/">
                おすすめ
              </Link>
              <Link className={styles.navLink} href="/mypage">
                マイリスト
              </Link>
              <Link className={styles.navLink} href="/logout">
                ログアウト
              </Link>
            </>
          ) : (
            <>
              <Link className={styles.navLink} href="/login">
                ログイン
              </Link>
              <Link className={styles.navLink} href="/signup">
                新規登録
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
