import Link from "next/link";
import { loginAction } from "@/app/auth-actions";

type Props = {
  searchParams: {
    error?: string;
    message?: string;
  };
};

export default function LoginPage({ searchParams }: Props) {
  return (
    <section className="card narrow">
      <h1>Login</h1>
      {searchParams.message ? <p className="notice ok">{searchParams.message}</p> : null}
      {searchParams.error ? <p className="notice error">{searchParams.error}</p> : null}
      <form action={loginAction} className="stack">
        <label className="field">
          <span>Email</span>
          <input type="email" name="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" name="password" required />
        </label>
        <button type="submit" className="button primary">
          Login
        </button>
      </form>
      <p className="muted">
        アカウントがない場合は <Link href="/signup">Signup</Link>
      </p>
    </section>
  );
}
