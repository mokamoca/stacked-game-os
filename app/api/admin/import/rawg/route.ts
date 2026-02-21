import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const RAWG_ENDPOINT = "https://api.rawg.io/api/games";
const MAX_PAGES = 3;

const RAWG_PLATFORM_ID_MAP: Record<string, number> = {
  playstation4: 18,
  playstation5: 187,
  pc: 4,
  "nintendo-switch": 7,
  "xbox-one": 1,
  "xbox-series-x": 186,
  ios: 3,
  android: 21
};

const RAWG_GENRE_MAP: Record<string, string> = {
  action: "action",
  "role-playing-games-rpg": "rpg",
  adventure: "adventure",
  simulation: "simulation",
  strategy: "strategy",
  puzzle: "puzzle",
  shooter: "shooting",
  sports: "sports",
  racing: "racing",
  sandbox: "sandbox",
  survival: "survival",
  roguelike: "roguelike"
};

const RAWG_PLATFORM_MAP: Record<string, string> = {
  playstation4: "PS4",
  playstation5: "PS5",
  pc: "PC",
  "nintendo-switch": "SWITCH",
  "xbox-one": "XBOXONE",
  "xbox-series-x": "XBOXSERIES",
  ios: "IOS",
  android: "ANDROID"
};

type ImportBody = {
  pageSize?: number;
  platforms?: string[];
  sinceYear?: number;
};

type RawgListGame = {
  id: number;
  name?: string | null;
  background_image?: string | null;
  released?: string | null;
  description_raw?: string | null;
  short_description?: string | null;
  genres?: Array<{ slug?: string | null }>;
  platforms?: Array<{ platform?: { slug?: string | null } }>;
};

type RawgListResponse = {
  results?: RawgListGame[];
  next?: string | null;
};

type PreparedGame = {
  externalId: string;
  title: string;
  releaseYear: number;
  coverUrl: string | null;
  summaryShort: string;
  genreCodes: string[];
  platformCodes: string[];
  rawPayload: RawgListGame;
};

function isAuthorized(request: NextRequest): boolean {
  const token = request.headers.get("x-admin-token")?.trim();
  const expected = process.env.ADMIN_IMPORT_TOKEN?.trim();
  if (!expected) return false;
  return token === expected;
}

function normalizePlatforms(input: unknown): string[] {
  const defaults = ["playstation4", "playstation5", "pc", "nintendo-switch", "xbox-one", "xbox-series-x"];
  if (!Array.isArray(input)) return defaults;

  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of input) {
    if (typeof value !== "string") continue;
    const slug = value.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    if (!(slug in RAWG_PLATFORM_ID_MAP)) continue;
    seen.add(slug);
    output.push(slug);
  }
  return output.length > 0 ? output : defaults;
}

function normalizePageSize(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 50;
  const intValue = Math.floor(value);
  if (intValue <= 0) return 50;
  return Math.min(100, intValue);
}

function normalizeSinceYear(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 2013;
  const intValue = Math.floor(value);
  if (intValue < 1990) return 1990;
  if (intValue > 2100) return 2100;
  return intValue;
}

function parseReleaseYear(value: string | null | undefined): number | null {
  if (!value) return null;
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? year : null;
}

function compactSummary(input: string | null | undefined): string {
  if (!input) return "";
  const collapsed = input.replace(/\s+/g, " ").trim();
  if (!collapsed) return "";
  return collapsed.length > 280 ? `${collapsed.slice(0, 280)}…` : collapsed;
}

function prepareGame(raw: RawgListGame, sinceYear: number): PreparedGame | null {
  const releaseYear = parseReleaseYear(raw.released);
  if (releaseYear == null || releaseYear < sinceYear) return null;

  const title = (raw.name ?? "").trim();
  if (!title) return null;

  const genreCodes = Array.from(
    new Set(
      (raw.genres ?? [])
        .map((item) => item.slug?.trim().toLowerCase() ?? "")
        .map((slug) => RAWG_GENRE_MAP[slug])
        .filter((value): value is string => Boolean(value))
    )
  );

  const platformCodes = Array.from(
    new Set(
      (raw.platforms ?? [])
        .map((item) => item.platform?.slug?.trim().toLowerCase() ?? "")
        .map((slug) => RAWG_PLATFORM_MAP[slug])
        .filter((value): value is string => Boolean(value))
    )
  );

  return {
    externalId: String(raw.id),
    title,
    releaseYear,
    coverUrl: raw.background_image ?? null,
    summaryShort: compactSummary(raw.description_raw ?? raw.short_description ?? ""),
    genreCodes,
    platformCodes,
    rawPayload: raw
  };
}

async function fetchRawgPage(params: {
  apiKey: string;
  platformIds: number[];
  page: number;
  perPage: number;
  sinceYear: number;
}) {
  const now = new Date();
  const endDate = `${now.getFullYear()}-12-31`;
  const startDate = `${params.sinceYear}-01-01`;
  const query = new URLSearchParams({
    key: params.apiKey,
    page: String(params.page),
    page_size: String(params.perPage),
    ordering: "-added",
    dates: `${startDate},${endDate}`
  });

  if (params.platformIds.length > 0) {
    query.set("platforms", params.platformIds.join(","));
  }

  const response = await fetch(`${RAWG_ENDPOINT}?${query.toString()}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`RAWG request failed: ${response.status}`);
  }
  return (await response.json()) as RawgListResponse;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const rawgApiKey = process.env.RAWG_API_KEY?.trim();
  if (!rawgApiKey) {
    return NextResponse.json({ error: "RAWG_API_KEY is missing" }, { status: 500 });
  }

  let body: ImportBody = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      body = (await request.json()) as ImportBody;
    }
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const pageSize = normalizePageSize(body.pageSize);
  const sinceYear = normalizeSinceYear(body.sinceYear);
  const platformSlugs = normalizePlatforms(body.platforms);
  const platformIds = Array.from(new Set(platformSlugs.map((slug) => RAWG_PLATFORM_ID_MAP[slug]).filter(Boolean)));
  const perPage = Math.min(pageSize, 40);

  const collectedRaw: RawgListGame[] = [];
  for (let page = 1; page <= MAX_PAGES && collectedRaw.length < pageSize; page += 1) {
    const payload = await fetchRawgPage({
      apiKey: rawgApiKey,
      platformIds,
      page,
      perPage,
      sinceYear
    });
    const batch = payload.results ?? [];
    if (batch.length === 0) break;
    collectedRaw.push(...batch);
    if (!payload.next) break;
  }

  const prepared: PreparedGame[] = [];
  let skippedCount = 0;
  for (const item of collectedRaw) {
    if (prepared.length >= pageSize) break;
    const normalized = prepareGame(item, sinceYear);
    if (!normalized) {
      skippedCount += 1;
      continue;
    }
    prepared.push(normalized);
  }

  const admin = createAdminClient();
  const externalIds = prepared.map((item) => item.externalId);

  const existingByExternal = new Map<string, { game_id: string }>();
  if (externalIds.length > 0) {
    const { data: existingRows, error: existingError } = await admin
      .from("game_external_ids")
      .select("external_id,game_id")
      .eq("provider", "rawg")
      .in("external_id", externalIds);
    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    for (const row of existingRows ?? []) {
      existingByExternal.set(row.external_id, { game_id: row.game_id });
    }
  }

  let importedCount = 0;
  let updatedCount = 0;

  for (const game of prepared) {
    try {
      const existing = existingByExternal.get(game.externalId);
      let gameId = existing?.game_id ?? null;

      if (gameId) {
        const { error } = await admin
          .from("games")
          .update({
            title: game.title,
            release_year: game.releaseYear,
            cover_url: game.coverUrl,
            summary_short: game.summaryShort
          })
          .eq("id", gameId);
        if (error) throw error;
        updatedCount += 1;

        const { error: updateExternalError } = await admin
          .from("game_external_ids")
          .update({ raw_payload: game.rawPayload })
          .eq("game_id", gameId)
          .eq("provider", "rawg");
        if (updateExternalError) throw updateExternalError;
      } else {
        const { data: inserted, error: insertGameError } = await admin
          .from("games")
          .insert({
            title: game.title,
            release_year: game.releaseYear,
            cover_url: game.coverUrl,
            summary_short: game.summaryShort
          })
          .select("id")
          .single<{ id: string }>();
        if (insertGameError) throw insertGameError;
        gameId = inserted.id;

        const { error: insertExternalError } = await admin.from("game_external_ids").insert({
          game_id: gameId,
          provider: "rawg",
          external_id: game.externalId,
          raw_payload: game.rawPayload
        });
        if (insertExternalError) throw insertExternalError;

        importedCount += 1;
      }

      const { error: deleteGenresError } = await admin.from("game_genres").delete().eq("game_id", gameId);
      if (deleteGenresError) throw deleteGenresError;
      const { error: deletePlatformsError } = await admin.from("game_platforms").delete().eq("game_id", gameId);
      if (deletePlatformsError) throw deletePlatformsError;

      if (game.genreCodes.length > 0) {
        const { error: insertGenresError } = await admin
          .from("game_genres")
          .insert(game.genreCodes.map((genreCode) => ({ game_id: gameId, genre_code: genreCode })));
        if (insertGenresError) throw insertGenresError;
      }

      if (game.platformCodes.length > 0) {
        const { error: insertPlatformsError } = await admin
          .from("game_platforms")
          .insert(game.platformCodes.map((platformCode) => ({ game_id: gameId, platform_code: platformCode })));
        if (insertPlatformsError) throw insertPlatformsError;
      }
    } catch {
      skippedCount += 1;
    }
  }

  return NextResponse.json({
    importedCount,
    skippedCount,
    updatedCount
  });
}
