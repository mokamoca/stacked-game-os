import AuthForm from "@/app/components/ui/auth-form";
import styles from "@/app/components/ui/ui.module.css";
import { loginAction, signupAction } from "@/app/auth-actions";

type Props = {
  searchParams: {
    error?: string;
  };
};

export default function SignupPage({ searchParams }: Props) {
  return (
    <section className={styles.authSection}>
      <AuthForm mode="login" action={loginAction} />
      <AuthForm mode="signup" action={signupAction} error={searchParams.error} />
    </section>
  );
}
