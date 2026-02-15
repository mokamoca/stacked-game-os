import Link from "next/link";
import styles from "@/app/components/ui/ui.module.css";

type Mode = "login" | "signup";

type Props = {
  mode: Mode;
  action: (formData: FormData) => Promise<void>;
  message?: string;
  error?: string;
};

export default function AuthForm({ mode, action, message, error }: Props) {
  const isLogin = mode === "login";

  return (
    <article className={`${styles.card} ${styles.authCard}`}>
      <h1 className={styles.authTitle}>{isLogin ? "ログイン" : "新規登録"}</h1>
      {message ? <p className={`${styles.notice} ${styles.ok}`}>{message}</p> : null}
      {error ? <p className={`${styles.notice} ${styles.error}`}>{error}</p> : null}

      <form action={action} className={styles.stack}>
        <label className={styles.field}>
          <span>メールアドレス</span>
          <input className={styles.input} type="email" name="email" required />
        </label>
        <label className={styles.field}>
          <span>{isLogin ? "パスワード" : "パスワード（6文字以上）"}</span>
          <input className={styles.input} type="password" name="password" minLength={isLogin ? undefined : 6} required />
        </label>

        <button type="submit" className={`${styles.button} ${styles.buttonPrimary}`}>
          {isLogin ? "ログイン" : "新規登録"}
        </button>
      </form>

      <p className={`${styles.muted} ${styles.authFoot}`}>
        {isLogin ? (
          <>
            アカウントをお持ちでない方は <Link href="/signup">新規登録</Link>
          </>
        ) : (
          <>
            すでにアカウントをお持ちの方は <Link href="/login">ログイン</Link>
          </>
        )}
      </p>
    </article>
  );
}
