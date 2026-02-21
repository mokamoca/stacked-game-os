import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANON_COOKIE_NAME, resolveRequestActor } from "@/lib/request-actor";
import { generateWhyText } from "@/lib/why-text";
import { type EraMode } from "@/lib/mvp-constants";

type ClaimNextRow = {
  exhausted: boolean;
  game_id: string | null;
  shown_event_id: string | null;
};

type GameRow = {
  id: string;
  title: string;
  release_year: number | null;
  cover_url: string | null;
  summary_short: string;
};

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

function getTopCodes(rows: Array<{ genre_code: string; count: number }>, limit = 2): string[] {
  return rows
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((item) => item.genre_code);
}

async function fetchTrend(params: { userId: string | null; anonId: string | null }) {
  const admin = createAdminClient();
  const q = admin
    .from("recommendation_events")
    .select("action,games!inner(id,game_genres(genre_code))")
    .in("action", ["played", "wishlist", "blocked"])
    .limit(500);
  const { data, error } =
    params.userId != null ? await q.eq("user_id", params.userId) : await q.eq("anon_id", params.anonId);
  if (error) throw error;

  const byAction: Record<string, Record<string, number>> = {
    played: {},
    wishlist: {},
    blocked: {}
  };

  for (const row of data ?? []) {
    const action = typeof row.action === "string" ? row.action : "";
    if (!(action in byAction)) continue;
    const game = Array.isArray(row.games) ? row.games[0] : row.games;
    const gameGenres = (game as { game_genres?: Array<{ genre_code?: string }> } | null)?.game_genres ?? [];
    for (const item of gameGenres) {
      const code = item.genre_code?.trim();
      if (!code) continue;
      byAction[action][code] = (byAction[action][code] ?? 0) + 1;
    }
  }

  const toEntries = (action: "played" | "wishlist" | "blocked") =>
    Object.entries(byAction[action]).map(([genre_code, count]) => ({ genre_code, count }));

  return {
    playedTopGenres: getTopCodes(toEntries("played")),
    wishlistTopGenres: getTopCodes(toEntries("wishlist")),
    blockedTopGenres: getTopCodes(toEntries("blocked"))
  };
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveRequestActor(request);
    const admin = createAdminClient();

    const { data: claimRows, error: claimError } = await admin.rpc("claim_next_recommendation", {
      p_user_id: actor.userId,
      p_anon_id: actor.anonId,
      p_max_retries: 8
    });

    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }

    const row = ((claimRows ?? []) as ClaimNextRow[])[0];
    if (!row || row.exhausted || !row.game_id || !row.shown_event_id) {
      const exhaustedResponse = NextResponse.json({
        exhausted: true,
        message: "この条件では未提示の候補が尽きました",
        suggestions: ["clear_genres", "add_platform", "set_retro"]
      });
      return withAnonCookie(exhaustedResponse, actor.anonId, actor.shouldSetAnonCookie);
    }

    const { data: game, error: gameError } = await admin
      .from("games")
      .select("id,title,release_year,cover_url,summary_short")
      .eq("id", row.game_id)
      .single<GameRow>();
    if (gameError) {
      return NextResponse.json({ error: gameError.message }, { status: 500 });
    }

    const [{ data: genresRows, error: genresError }, { data: platformsRows, error: platformsError }] = await Promise.all([
      admin
        .from("game_genres")
        .select("genre_code,genres!inner(label_ja)")
        .eq("game_id", row.game_id),
      admin
        .from("game_platforms")
        .select("platform_code,platforms!inner(label_ja)")
        .eq("game_id", row.game_id)
    ]);

    if (genresError) {
      return NextResponse.json({ error: genresError.message }, { status: 500 });
    }
    if (platformsError) {
      return NextResponse.json({ error: platformsError.message }, { status: 500 });
    }

    const genres = (genresRows ?? []).map((item) => {
      const relation = Array.isArray(item.genres) ? item.genres[0] : item.genres;
      return relation?.label_ja ?? item.genre_code;
    });
    const platforms = (platformsRows ?? []).map((item) => {
      const relation = Array.isArray(item.platforms) ? item.platforms[0] : item.platforms;
      return relation?.label_ja ?? item.platform_code;
    });

    const filterQuery = admin
      .from("user_filter_state")
      .select("era_mode,genre_codes,platform_codes")
      .limit(1);
    const { data: filterData, error: filterError } =
      actor.userId != null
        ? await filterQuery.eq("user_id", actor.userId).maybeSingle()
        : await filterQuery.eq("anon_id", actor.anonId).maybeSingle();
    if (filterError) {
      return NextResponse.json({ error: filterError.message }, { status: 500 });
    }

    const trend = await fetchTrend({ userId: actor.userId, anonId: actor.anonId });
    const whyText = await generateWhyText({
      game: {
        title: game.title,
        releaseYear: game.release_year,
        genres,
        platforms,
        summaryShort: game.summary_short
      },
      filter: {
        eraMode: ((filterData?.era_mode ?? "ps4_plus") as EraMode),
        genreCodes: (filterData?.genre_codes ?? null) as string[] | null,
        platformCodes: (filterData?.platform_codes ?? null) as string[] | null
      },
      trend
    });

    await admin.from("recommendation_events").update({ why_text: whyText }).eq("id", row.shown_event_id);

    const response = NextResponse.json({
      exhausted: false,
      recommendation: {
        game: {
          id: game.id,
          title: game.title,
          release_year: game.release_year,
          cover_url: game.cover_url,
          summary_short: game.summary_short,
          genres,
          platforms
        },
        why_text: whyText,
        shown_event_id: row.shown_event_id
      }
    });
    return withAnonCookie(response, actor.anonId, actor.shouldSetAnonCookie);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed_to_fetch_recommendation";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
