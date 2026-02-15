import type { Metadata } from "next";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/app/components/ui/app-header";
import styles from "@/app/components/ui/ui.module.css";

export const metadata: Metadata = {
  title: "Stacked Game OS",
  description: "外部ゲームDBから今日の1本を見つける"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <html lang="ja">
      <body className={styles.page}>
        <AppHeader isAuthenticated={Boolean(user)} />
        <main className={`${styles.container} ${styles.main}`}>{children}</main>
      </body>
    </html>
  );
}
