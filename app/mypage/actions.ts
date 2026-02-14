"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { InteractionAction } from "@/lib/types";

const EDITABLE_ACTIONS: InteractionAction[] = ["like", "played", "not_now", "dont_recommend", "shown"];

function getString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeReturnTo(raw: string): string {
  return raw.startsWith("/") ? raw : "/mypage";
}

export async function updateInteractionAction(formData: FormData) {
  const id = getString(formData, "id");
  const nextAction = getString(formData, "next_action");
  const returnTo = safeReturnTo(getString(formData, "return_to") || "/mypage");

  if (!id || !EDITABLE_ACTIONS.includes(nextAction as InteractionAction)) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("入力が不正です")}`);
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("interactions").update({ action: nextAction }).eq("id", id).eq("user_id", user.id);

  if (error) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}message=${encodeURIComponent("アクションを更新しました")}`);
}

export async function deleteInteractionAction(formData: FormData) {
  const id = getString(formData, "id");
  const returnTo = safeReturnTo(getString(formData, "return_to") || "/mypage");

  if (!id) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("履歴IDが不足しています")}`);
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("interactions").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}message=${encodeURIComponent("履歴を削除しました")}`);
}
