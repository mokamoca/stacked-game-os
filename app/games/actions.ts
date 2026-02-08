"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const platform = getString(formData, "platform");
  const moodTags = getString(formData, "mood_tags");

  if (!title || !platform) {
    redirect("/games/new?error=Title+and+platform+are+required");
  }

  const { supabase, user } = await getUserOrRedirect();

  const { error } = await supabase.from("games").insert({
    user_id: user.id,
    title,
    platform,
    mood_tags: moodTags
  });

  if (error) {
    redirect(`/games/new?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/games?message=Game+created");
}

export async function updateGameAction(formData: FormData) {
  const id = getString(formData, "id");
  const title = getString(formData, "title");
  const platform = getString(formData, "platform");
  const moodTags = getString(formData, "mood_tags");

  if (!id || !title || !platform) {
    redirect("/games?error=Invalid+input");
  }

  const { supabase, user } = await getUserOrRedirect();

  const { error } = await supabase
    .from("games")
    .update({ title, platform, mood_tags: moodTags })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    redirect(`/games/${id}/edit?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/games?message=Game+updated");
}

export async function deleteGameAction(formData: FormData) {
  const id = getString(formData, "id");

  if (!id) {
    redirect("/games?error=Missing+game+id");
  }

  const { supabase, user } = await getUserOrRedirect();

  const { error } = await supabase.from("games").delete().eq("id", id).eq("user_id", user.id);

  if (error) {
    redirect(`/games?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/games?message=Game+deleted");
}
