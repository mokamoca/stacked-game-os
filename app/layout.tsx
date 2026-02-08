import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Stacked Game OS",
  description: "Pick today's game from your backlog"
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
                  <Link href="/">Dashboard</Link>
                  <Link href="/games">Games</Link>
                  <Link href="/logout">Logout</Link>
                </>
              ) : (
                <>
                  <Link href="/login">Login</Link>
                  <Link href="/signup">Signup</Link>
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
