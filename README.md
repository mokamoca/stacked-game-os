# Stacked Game OS (MVP)

Next.js(App Router) + Supabase で「積みゲーから今日の1本(最大3本)を決める」アプリです。

## 1. ローカル起動

前提: Node.js 20+ 推奨

```bash
npm install
npm run dev
```

ブラウザ: `http://localhost:3000`

## 2. 環境変数

ルートの `.env.local` に以下を設定:

```env
NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## 3. Supabase セットアップ

1. Supabase プロジェクト作成
2. Authentication > Providers > Email を有効化
3. SQL Editor で `supabase/schema.sql` を全文実行
4. Project Settings > API から URL / anon key を取得し `.env.local` に設定
5. (任意) Authentication > URL Configuration の Site URL を
   `http://localhost:3000` (開発) / Vercel URL (本番) に設定

### スキーマ要点

- `games`, `interactions` の2テーブル
- 両テーブルで RLS 有効化
- `auth.uid() = user_id` の行のみ SELECT/INSERT/UPDATE/DELETE 可
- `interactions` INSERT/UPDATE は `game_id` が自分の `games` に紐づく場合のみ可

## 4. アプリ機能

- 認証: `/login`, `/signup`, `/logout` (Email/Password)
- 保護ルート: `/`, `/games*` は未ログイン時 `/login` へリダイレクト
- ゲーム管理: `/games`, `/games/new`, `/games/[id]/edit`, 削除
- ダッシュボード: 気分タグ + プレイ時間で推薦最大3件
- ワンアクション: `like`, `played`, `not_now`, `dont_recommend` を保存
- 推薦表示時に `shown` を自動記録（短時間重複は抑制）

## 5. Vercel デプロイ

1. GitHub に push
2. Vercel でリポジトリを Import
3. Build 設定はデフォルト (`next build`)
4. Environment Variables に以下を設定:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy
6. Supabase Authentication > URL Configuration の Site URL を Vercel 本番URLに更新

## 6. 運用メモ

- service role key は使用していません
- DBアクセスは Server Components / Server Actions 経由
- 重要なデータ分離は RLS で担保
