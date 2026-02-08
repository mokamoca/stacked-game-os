import { logoutAction } from "@/app/auth-actions";

export default function LogoutPage() {
  return (
    <section className="card narrow">
      <h1>Logout</h1>
      <p className="muted">現在のセッションを終了します。</p>
      <form action={logoutAction}>
        <button type="submit" className="button primary">
          Logout
        </button>
      </form>
    </section>
  );
}
