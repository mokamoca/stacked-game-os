import Link from "next/link";
import { signupAction } from "@/app/auth-actions";

type Props = {
  searchParams: {
    error?: string;
  };
};

export default function SignupPage({ searchParams }: Props) {
  return (
    <section className="card narrow">
      <h1>Signup</h1>
      {searchParams.error ? <p className="notice error">{searchParams.error}</p> : null}
      <form action={signupAction} className="stack">
        <label className="field">
          <span>Email</span>
          <input type="email" name="email" required />
        </label>
        <label className="field">
          <span>Password (6+ chars)</span>
          <input type="password" name="password" minLength={6} required />
        </label>
        <button type="submit" className="button primary">
          Create account
        </button>
      </form>
      <p className="muted">
        すでにアカウントがある場合は <Link href="/login">Login</Link>
      </p>
    </section>
  );
}
