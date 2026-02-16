import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type UpdatePayload = {
  external_source: string;
  external_game_id: string;
  game_title_snapshot?: string;
  liked?: boolean;
  played?: boolean;
  disliked?: boolean;
  dont_recommend?: boolean;
};

type RequestBody = {
  updates?: UpdatePayload[];
};

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

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function asBool(value: unknown): boolean {
  return value === true;
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const updates = Array.isArray(body.updates) ? body.updates : [];
  if (updates.length === 0) {
    return NextResponse.json({ ok: true, saved: 0 });
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const deduped = new Map<string, UpdatePayload>();
  for (const item of updates) {
    const source = asTrimmed(item.external_source);
    const gameId = asTrimmed(item.external_game_id);
    if (!source || !gameId) continue;
    deduped.set(`${source}:${gameId}`, item);
  }

  if (deduped.size === 0) {
    return NextResponse.json({ ok: true, saved: 0 });
  }

  const rows = Array.from(deduped.values()).map((item) => {
    const source = asTrimmed(item.external_source);
    const gameId = asTrimmed(item.external_game_id);
    const titleSnapshot = asTrimmed(item.game_title_snapshot);
    const state = normalizeState({
      liked: asBool(item.liked),
      played: asBool(item.played),
      disliked: asBool(item.disliked),
      dontRecommend: asBool(item.dont_recommend)
    });

    return {
      user_id: user.id,
      external_source: source,
      external_game_id: gameId,
      game_title_snapshot: titleSnapshot,
      liked: state.liked,
      played: state.played,
      disliked: state.disliked,
      dont_recommend: state.dontRecommend,
      updated_at: new Date().toISOString()
    };
  });

  const { error } = await supabase.from("user_game_states").upsert(rows, {
    onConflict: "user_id,external_source,external_game_id"
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, saved: rows.length });
}
