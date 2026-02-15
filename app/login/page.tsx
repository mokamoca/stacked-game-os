import AuthForm from "@/app/components/ui/auth-form";
import styles from "@/app/components/ui/ui.module.css";
import { loginAction, signupAction } from "@/app/auth-actions";

type Props = {
  searchParams: {
    error?: string;
    message?: string;
  };
};

export default function LoginPage({ searchParams }: Props) {
  return (
    <section className={styles.authSection}>
      <AuthForm mode="login" action={loginAction} message={searchParams.message} error={searchParams.error} />
      <AuthForm mode="signup" action={signupAction} />
    </section>
  );
}
