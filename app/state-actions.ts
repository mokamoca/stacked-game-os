"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "true" || value === "on" || value === "1";
}

function safeReturnTo(raw: string): string {
  return raw.startsWith("/") ? raw : "/";
}

function normalizeState(input: {
  liked: boolean;
  played: boolean;
  disliked: boolean;
  dontRecommend: boolean;
}) {
  let { liked, played, disliked, dontRecommend } = input;

  if (disliked) liked = false;
  if (dontRecommend) {
    disliked = true;
    liked = false;
  }

  return { liked, played, disliked, dontRecommend };
}

async function getUserOrRedirect() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

export async function upsertGameStateAction(formData: FormData) {
  const externalSource = getString(formData, "external_source");
  const externalGameId = getString(formData, "external_game_id");
  const titleSnapshot = getString(formData, "game_title_snapshot");
  const returnTo = safeReturnTo(getString(formData, "return_to") || "/");

  if (!externalSource || !externalGameId) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("ゲーム情報の指定が不足しています")}`);
  }

  const state = normalizeState({
    liked: getBoolean(formData, "liked"),
    played: getBoolean(formData, "played"),
    disliked: getBoolean(formData, "disliked"),
    dontRecommend: getBoolean(formData, "dont_recommend")
  });

  const { supabase, user } = await getUserOrRedirect();

  const { error } = await supabase.from("user_game_states").upsert(
    {
      user_id: user.id,
      external_source: externalSource,
      external_game_id: externalGameId,
      game_title_snapshot: titleSnapshot,
      liked: state.liked,
      played: state.played,
      disliked: state.disliked,
      dont_recommend: state.dontRecommend,
      updated_at: new Date().toISOString()
    },
    {
      onConflict: "user_id,external_source,external_game_id"
    }
  );

  if (error) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}message=${encodeURIComponent("ゲーム状態を保存しました")}`);
}

export async function updateGameStateByIdAction(formData: FormData) {
  const id = getString(formData, "id");
  const returnTo = safeReturnTo(getString(formData, "return_to") || "/mypage");

  if (!id) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("状態IDが不足しています")}`);
  }

  const state = normalizeState({
    liked: getBoolean(formData, "liked"),
    played: getBoolean(formData, "played"),
    disliked: getBoolean(formData, "disliked"),
    dontRecommend: getBoolean(formData, "dont_recommend")
  });

  const { supabase, user } = await getUserOrRedirect();
  const { error } = await supabase
    .from("user_game_states")
    .update({
      liked: state.liked,
      played: state.played,
      disliked: state.disliked,
      dont_recommend: state.dontRecommend,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}message=${encodeURIComponent("ゲーム状態を更新しました")}`);
}

export async function deleteGameStateByIdAction(formData: FormData) {
  const id = getString(formData, "id");
  const returnTo = safeReturnTo(getString(formData, "return_to") || "/mypage");

  if (!id) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("状態IDが不足しています")}`);
  }

  const { supabase, user } = await getUserOrRedirect();
  const { error } = await supabase.from("user_game_states").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}message=${encodeURIComponent("ゲームを棚から削除しました")}`);
}
