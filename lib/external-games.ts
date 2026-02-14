import type { Interaction } from "@/lib/types";

type ExternalSource = "rawg";

export type ExternalGame = {
  external_source: ExternalSource;
  external_game_id: string;
  title: string;
  platform: string;
  genre_tags: string[];
  image_url: string;
  score_hint: number;
  rating: number;
  metacritic: number;
  ratings_count: number;
  released: string;
};

type FetchParams = {
  platforms: string[];
  genres: string[];
};

type FetchResult = {
  games: ExternalGame[];
  error?: string;
};

const RAWG_ENDPOINT = "https://api.rawg.io/api/games";
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_RESULTS = 24;

const RAWG_PLATFORM_MAP: Record<string, number> = {
  pc: 4,
  playstation: 18,
  switch: 7,
  xbox: 1,
  mobile: 3
};

const RAWG_GENRE_MAP: Record<string, string> = {
  rpg: "role-playing-games-rpg",
  act: "action",
  adv: "adventure",
  slg: "strategy",
  fps: "shooter",
  indie: "indie"
};

type CacheItem = {
  expiresAt: number;
  value: FetchResult;
};

const localCache = new Map<string, CacheItem>();

type RawgGame = {
  id: number;
  name: string;
  background_image?: string | null;
  rating?: number | null;
  ratings_count?: number | null;
  metacritic?: number | null;
  released?: string | null;
  genres?: Array<{ name?: string | null }>;
  platforms?: Array<{ platform?: { name?: string | null } }>;
};

type RawgResponse = {
  results?: RawgGame[];
};

function normalizeQuery(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function cacheKey(params: FetchParams): string {
  const platforms = normalizeQuery(params.platforms).sort().join(",");
  const genres = normalizeQuery(params.genres).sort().join(",");
  return `platforms=${platforms}&genres=${genres}`;
}

function fromCache(key: string): FetchResult | null {
  const hit = localCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    localCache.delete(key);
    return null;
  }
  return hit.value;
}

function putCache(key: string, value: FetchResult) {
  localCache.set(key, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value
  });
}

function externalKey(source: string, id: string): string {
  return `${source}:${id}`;
}

function toRawgPlatformParam(platforms: string[]): string {
  const ids = normalizeQuery(platforms)
    .map((key) => RAWG_PLATFORM_MAP[key])
    .filter((value): value is number => typeof value === "number");
  return Array.from(new Set(ids)).join(",");
}

function toRawgGenreParam(genres: string[]): string {
  const slugs = normalizeQuery(genres)
    .map((key) => RAWG_GENRE_MAP[key])
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(slugs)).join(",");
}

function recencyBoost(released: string): number {
  if (!released) return 0;
  const releasedMs = new Date(released).getTime();
  if (Number.isNaN(releasedMs)) return 0;
  const days = Math.floor((Date.now() - releasedMs) / (24 * 60 * 60 * 1000));
  if (days < 0) return 0;
  if (days <= 365) return 2;
  if (days <= 365 * 2) return 1;
  return 0;
}

function mapRawgGame(game: RawgGame): ExternalGame {
  const platformNames = (game.platforms ?? [])
    .map((item) => item.platform?.name?.trim())
    .filter((value): value is string => Boolean(value));
  const genreNames = (game.genres ?? [])
    .map((item) => item.name?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));

  const rating = typeof game.rating === "number" ? game.rating : 0;
  const ratingCount = typeof game.ratings_count === "number" ? game.ratings_count : 0;
  const metacritic = typeof game.metacritic === "number" ? game.metacritic : 0;
  const released = typeof game.released === "string" ? game.released : "";

  const scoreHint =
    rating * 8 +
    Math.min(12, Math.log10(Math.max(1, ratingCount)) * 4) +
    metacritic / 20 +
    recencyBoost(released);

  return {
    external_source: "rawg",
    external_game_id: String(game.id),
    title: game.name?.trim() || "タイトル不明",
    platform: platformNames.length > 0 ? platformNames.join(", ") : "不明",
    genre_tags: Array.from(new Set(genreNames)),
    image_url: game.background_image ?? "",
    score_hint: scoreHint,
    rating,
    metacritic,
    ratings_count: ratingCount,
    released
  };
}

export async function fetchExternalGames(params: FetchParams): Promise<FetchResult> {
  const apiKey = process.env.RAWG_API_KEY?.trim();
  if (!apiKey) {
    return { games: [], error: "RAWG_API_KEY が未設定です" };
  }

  const key = cacheKey(params);
  const cached = fromCache(key);
  if (cached) return cached;

  const qs = new URLSearchParams({
    key: apiKey,
    page_size: String(MAX_RESULTS),
    ordering: "-rating"
  });

  const platformParam = toRawgPlatformParam(params.platforms);
  if (platformParam) qs.set("platforms", platformParam);

  const genreParam = toRawgGenreParam(params.genres);
  if (genreParam) qs.set("genres", genreParam);

  try {
    const response = await fetch(`${RAWG_ENDPOINT}?${qs.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      const failure = { games: [], error: `外部API取得に失敗しました (${response.status})` };
      putCache(key, failure);
      return failure;
    }

    const payload = (await response.json()) as RawgResponse;
    const games = (payload.results ?? []).map(mapRawgGame);
    const success = { games };
    putCache(key, success);
    return success;
  } catch {
    const failure = { games: [], error: "外部APIへの接続でエラーが発生しました" };
    putCache(key, failure);
    return failure;
  }
}

export function rankExternalGames(params: {
  games: ExternalGame[];
  interactions: Interaction[];
  moodTags: string[];
  limit: number;
}): ExternalGame[] {
  const { games, interactions, limit } = params;
  const byKey = new Map<string, Interaction[]>();

  for (const interaction of interactions) {
    if (!interaction.external_source || !interaction.external_game_id) continue;
    const key = externalKey(interaction.external_source, interaction.external_game_id);
    const current = byKey.get(key) ?? [];
    current.push(interaction);
    byKey.set(key, current);
  }

  const scored = games
    .map((game) => {
      const key = externalKey(game.external_source, game.external_game_id);
      const history = byKey.get(key) ?? [];

      if (history.some((item) => item.action === "dont_recommend")) {
        return null;
      }

      let score = game.score_hint;
      const likeCount = history.filter((item) => item.action === "like").length;
      const playedCount = history.filter((item) => item.action === "played").length;
      const shownCount = history.filter((item) => item.action === "shown").length;
      const notNowCount = history.filter((item) => item.action === "not_now").length;

      score += likeCount * 9;
      score += playedCount * 2;
      score -= notNowCount * 5;
      score -= shownCount * 0.8;

      return { game, score };
    })
    .filter((item): item is { game: ExternalGame; score: number } => item !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, limit)).map((item) => item.game);
}
