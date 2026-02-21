import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ANON_COOKIE_NAME, resolveRequestActor } from "@/lib/request-actor";
import { ERA_MODES, GENRE_OPTIONS, PLATFORM_OPTIONS, type EraMode } from "@/lib/mvp-constants";

type FilterState = {
  era_mode: EraMode;
  genre_codes: string[] | null;
  platform_codes: string[] | null;
};

const ERA_SET = new Set<string>(ERA_MODES);
const GENRE_SET = new Set<string>(GENRE_OPTIONS.map((item) => item.code));
const PLATFORM_SET = new Set<string>(PLATFORM_OPTIONS.map((item) => item.code));

function normalizeCodes(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const code = item.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    output.push(code);
  }
  return output;
}

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

async function getOrCreateFilterState(actor: { userId: string | null; anonId: string | null }): Promise<FilterState> {
  const admin = createAdminClient();
  const query = admin.from("user_filter_state").select("id,era_mode,genre_codes,platform_codes").limit(1);
  const { data, error } =
    actor.userId != null ? await query.eq("user_id", actor.userId).maybeSingle() : await query.eq("anon_id", actor.anonId).maybeSingle();
  if (error) throw error;

  if (data) {
    return {
      era_mode: data.era_mode as EraMode,
      genre_codes: data.genre_codes as string[] | null,
      platform_codes: data.platform_codes as string[] | null
    };
  }

  const payload =
    actor.userId != null
      ? { user_id: actor.userId, era_mode: "ps4_plus", genre_codes: null, platform_codes: null }
      : { anon_id: actor.anonId, era_mode: "ps4_plus", genre_codes: null, platform_codes: null };
  const { data: inserted, error: insertError } = await admin
    .from("user_filter_state")
    .insert(payload)
    .select("era_mode,genre_codes,platform_codes")
    .single();
  if (insertError) throw insertError;

  return {
    era_mode: inserted.era_mode as EraMode,
    genre_codes: inserted.genre_codes as string[] | null,
    platform_codes: inserted.platform_codes as string[] | null
  };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveRequestActor(request);
    const state = await getOrCreateFilterState(actor);
    const response = NextResponse.json(state);
    return withAnonCookie(response, actor.anonId, actor.shouldSetAnonCookie);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed_to_get_filters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  let body: Partial<FilterState>;
  try {
    body = (await request.json()) as Partial<FilterState>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eraMode = typeof body.era_mode === "string" ? body.era_mode : "";
  if (!ERA_SET.has(eraMode)) {
    return NextResponse.json({ error: "invalid_era_mode" }, { status: 400 });
  }

  const genreCodes = normalizeCodes(body.genre_codes);
  const platformCodes = normalizeCodes(body.platform_codes);

  if (genreCodes !== null && genreCodes.length === 0) {
    return NextResponse.json({ error: "genre_codes_empty_array_not_allowed" }, { status: 400 });
  }
  if (platformCodes !== null && platformCodes.length === 0) {
    return NextResponse.json({ error: "platform_codes_empty_array_not_allowed" }, { status: 400 });
  }
  if (genreCodes !== null && genreCodes.some((code) => !GENRE_SET.has(code))) {
    return NextResponse.json({ error: "invalid_genre_code" }, { status: 400 });
  }
  if (platformCodes !== null && platformCodes.some((code) => !PLATFORM_SET.has(code))) {
    return NextResponse.json({ error: "invalid_platform_code" }, { status: 400 });
  }

  try {
    const actor = await resolveRequestActor(request);
    const admin = createAdminClient();
    const payload = {
      era_mode: eraMode as EraMode,
      genre_codes: genreCodes,
      platform_codes: platformCodes
    };

    const { data, error } =
      actor.userId != null
        ? await admin
            .from("user_filter_state")
            .upsert({ ...payload, user_id: actor.userId }, { onConflict: "user_id" })
            .select("era_mode,genre_codes,platform_codes")
            .single()
        : await admin
            .from("user_filter_state")
            .upsert({ ...payload, anon_id: actor.anonId }, { onConflict: "anon_id" })
            .select("era_mode,genre_codes,platform_codes")
            .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const response = NextResponse.json({
      era_mode: data.era_mode as EraMode,
      genre_codes: data.genre_codes as string[] | null,
      platform_codes: data.platform_codes as string[] | null
    });
    return withAnonCookie(response, actor.anonId, actor.shouldSetAnonCookie);
  } catch (error) {
    const message = error instanceof Error ? error.message : "failed_to_update_filters";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
