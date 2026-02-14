"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseList, parseTags } from "@/lib/tags";

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function getUserOrRedirect() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function createGameAction(formData: FormData) {
  const title = getString(formData, "title");
  const platform = parseList(getString(formData, "platform")).join(", ");
  const genreTags = parseTags(getString(formData, "genre_tags"));

  if (!title || !platform) {
    redirect(`/games/new?error=${encodeURIComponent("タイトルとプラットフォームは必須です")}`);
  }

  const { supabase, user } = await getUserOrRedirect();

  const { error } = await supabase.from("games").insert({
    user_id: user.id,
    title,
    platform,
    genre_tags: genreTags
  });

  if (error) {
    redirect(`/games/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/games?message=${encodeURIComponent("ゲームを追加しました")}`);
}

export async function updateGameAction(formData: FormData) {
  const id = getString(formData, "id");
  const title = getString(formData, "title");
  const platform = parseList(getString(formData, "platform")).join(", ");
  const genreTags = parseTags(getString(formData, "genre_tags"));

  if (!id || !title || !platform) {
    redirect(`/games?error=${encodeURIComponent("入力が不正です")}`);
  }

  const { supabase, user } = await getUserOrRedirect();

  const { error } = await supabase
    .from("games")
    .update({ title, platform, genre_tags: genreTags })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/games/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/games?message=${encodeURIComponent("ゲームを更新しました")}`);
}

export async function deleteGameAction(formData: FormData) {
  const id = getString(formData, "id");

  if (!id) {
    redirect(`/games?error=${encodeURIComponent("ゲームIDが不足しています")}`);
  }

  const { supabase, user } = await getUserOrRedirect();

  const { error } = await supabase.from("games").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    redirect(`/games?error=${encodeURIComponent(error.message)}`);
  }

  redirect(`/games?message=${encodeURIComponent("ゲームを削除しました")}`);
}
