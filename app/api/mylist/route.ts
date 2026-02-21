import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANON_COOKIE_NAME, resolveRequestActor } from "@/lib/request-actor";

type ListStatus = "played" | "wishlist" | "blocked";

const STATUS_SET = new Set<ListStatus>(["played", "wishlist", "blocked"]);

function withAnonCookie(response: NextResponse, anonId: string | null, shouldSet: boolean) {
  if (shouldSet && anonId) {
    response.cookies.set({
      name: ANON_COOKIE_NAME,
      value: anonId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365 * 2,
      path: "/"
    });
  }
  return response;
}

type EventRow = {
  game_id: string;
  action: ListStatus;
  created_at: string;
};

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? "";
  if (!STATUS_SET.has(status as ListStatus)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 400 });
  }

  try {
    const actor = await resolveRequestActor(request);
    const admin = createAdminClient();
    const query = admin
      .from("recommendation_events")
      .select("game_id,action,created_at")
      .in("action", ["played", "wishlist", "blocked"])
      .order("created_at", { ascending: false })
      .limit(1200);
    const { data, error } =
      actor.userId != null ? await query.eq("user_id", actor.userId) : await query.eq("anon_id", actor.anonId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const latestByGame = new Map<string, ListStatus>();
    for (const row of (data ?? []) as EventRow[]) {
      if (!latestByGame.has(row.game_id)) {
        latestByGame.set(row.game_id, row.action);
      }
    }

    const targetStatus = status as ListStatus;
    const gameIds = Array.from(latestByGame.entries())
      .filter(([, latest]) => latest === targetStatus)
      .map(([gameId]) => gameId);

    if (gameIds.length === 0) {
      const emptyResponse = NextResponse.json({ items: [] });
      return withAnonCookie(emptyResponse, actor.anonId, actor.shouldSetAnonCookie);
    }

    const [{ data: gamesRows, error: gamesError }, { data: genreRows, error: genreError }] = await Promise.all([
      admin.from("games").select("id,title,release_year,cover_url").in("id", gameIds),
      admin.from("game_genres").select("game_id,genres!inner(label_ja)").in("game_id", gameIds)
    ]);

    if (gamesError) return NextResponse.json({ error: gamesError.message }, { status: 500 });
    if (genreError) return NextResponse.json({ error: genreError.message }, { status: 500 });

    const genresByGame = new Map<string, string[]>();
    for (const row of genreRows ?? []) {
      const relation = Array.isArray(row.genres) ? row.genres[0] : row.genres;
      const label = relation?.label_ja ?? "";
      if (!label) continue;
      const current = genresByGame.get(row.game_id) ?? [];
      current.push(label);
      genresByGame.set(row.game_id, current);
    }

    const rank = new Map<string, number>();
    gameIds.forEach((id, idx) => rank.set(id, idx));
    const items = (gamesRows ?? [])
      .map((row) => ({
        id: row.id,
        title: row.title,
        release_year: row.release_year,
        cover_url: row.cover_url,
        genres: genresByGame.get(row.id) ?? []
      }))
      .sort((a, b) => (rank.get(a.id) ?? 999999) - (rank.get(b.id) ?? 999999));

    const response = NextResponse.json({ items });
    return withAnonCookie(response, actor.anonId, actor.shouldSetAnonCookie);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed_to_get_mylist";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
