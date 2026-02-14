import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";

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
      <body>
        <header className="header">
          <div className="container headerInner">
            <Link href="/" className="brand">
              Stacked Game OS
            </Link>
            <nav className="nav">
              {user ? (
                <>
                  <Link href="/">おすすめ</Link>
                  <Link href="/logout">ログアウト</Link>
                  <Link href="/games">マイゲーム（任意）</Link>
                </>
              ) : (
                <>
                  <Link href="/login">ログイン</Link>
                  <Link href="/signup">新規登録</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="container main">{children}</main>
      </body>
    </html>
  );
}
