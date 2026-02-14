"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { InteractionAction } from "@/lib/types";

const ALLOWED_ACTIONS: InteractionAction[] = [
  "like",
  "played",
  "not_now",
  "dont_recommend"
];

function parseTimeBucket(raw: string): number {
  const value = Number(raw);
  if ([15, 30, 60, 120].includes(value)) {
    return value;
  }
  return 30;
}

function safeReturnTo(raw: string): string {
  if (!raw.startsWith("/")) return "/";
  return raw;
}

export async function interactionAction(formData: FormData) {
  const action = formData.get("action");
  const gameId = formData.get("game_id");
  const externalSourceRaw = formData.get("external_source");
  const externalGameIdRaw = formData.get("external_game_id");
  const gameTitleSnapshotRaw = formData.get("game_title_snapshot");
  const timeBucketRaw = formData.get("time_bucket");
  const contextTagsRaw = formData.get("context_tags");
  const returnToRaw = formData.get("return_to");

  const returnTo =
    typeof returnToRaw === "string" ? safeReturnTo(returnToRaw) : "/";

  if (typeof action !== "string" || !ALLOWED_ACTIONS.includes(action as InteractionAction)) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("不正なアクションです")}`
    );
  }

  if (typeof gameId !== "string" || !gameId) {
    const externalSource = typeof externalSourceRaw === "string" ? externalSourceRaw.trim() : "";
    const externalGameId = typeof externalGameIdRaw === "string" ? externalGameIdRaw.trim() : "";
    if (!externalSource || !externalGameId) {
      redirect(
        `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent("ゲーム識別子が不足しています")}`
      );
    }
  }

  const timeBucket =
    typeof timeBucketRaw === "string" ? parseTimeBucket(timeBucketRaw) : 30;
  const contextTags = typeof contextTagsRaw === "string" ? contextTagsRaw.trim() : "";
  const externalSource = typeof externalSourceRaw === "string" ? externalSourceRaw.trim() : "";
  const externalGameId = typeof externalGameIdRaw === "string" ? externalGameIdRaw.trim() : "";
  const gameTitleSnapshot = typeof gameTitleSnapshotRaw === "string" ? gameTitleSnapshotRaw.trim() : "";
  const normalizedGameId = typeof gameId === "string" && gameId.trim() ? gameId.trim() : null;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("interactions").insert({
    user_id: user.id,
    game_id: normalizedGameId,
    external_source: externalSource,
    external_game_id: externalGameId,
    game_title_snapshot: gameTitleSnapshot,
    action,
    time_bucket: timeBucket,
    context_tags: contextTags
  });

  if (error) {
    redirect(
      `${returnTo}${returnTo.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`
    );
  }

  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}message=${encodeURIComponent("保存しました")}`);
}
