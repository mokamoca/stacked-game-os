import type { Interaction, UserGameState } from "@/lib/types";
import { parseTags } from "@/lib/tags";

type ExternalSource = "rawg";

export type ExternalGame = {
  external_source: ExternalSource;
  external_game_id: string;
  title: string;
  title_ja: string;
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
const SHOWN_COOLDOWN_HOURS = 48;
const SHOWN_COOLDOWN_MS = SHOWN_COOLDOWN_HOURS * 60 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const RAWG_DETAIL_TIMEOUT_MS = 1200;
const NON_BASE_TITLE_PATTERNS = [
  /\bdlc\b/i,
  /\bseason\s*pass\b/i,
  /\bsoundtrack\b/i,
  /\bart\s*book\b/i,
  /\bupgrade\b/i,
  /\bexpansion\b/i,
  /\bexpansion\s*pass\b/i,
  /\bbundle\b/i,
  /\bpack\b/i,
  /\bdemo\b/i,
  /\bbeta\b/i,
  /\btest\b/i,
  /\bdeluxe\b/i,
  /\bgold\b/i,
  /\bultimate\b/i,
  /\bcomplete\b/i,
  /\bdefinitive\b/i,
  /\bgoty\b/i,
  /\bedition\b/i,
  /追加コンテンツ/,
  /拡張パック/,
  /サウンドトラック/,
  /アートブック/,
  /シーズンパス/,
  /体験版/,
  /デモ版/,
  /セット/,
  /パック/
];

const RAWG_PLATFORM_MAP: Record<string, number[]> = {
  ps4: [18],
  ps5: [187],
  switch: [7],
  switch2: [7],
  steam: [4],
  "xbox-series": [186],
  playstation: [18, 187],
  pc: [4],
  xbox: [186, 1],
  mobile: [3]
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
const baseGameDetailCache = new Map<string, { expiresAt: number; isBaseGame: boolean }>();
const MOOD_GENRE_HINTS: Record<string, string[]> = {
  chill: ["adventure", "simulation", "puzzle", "casual", "indie", "family"],
  story: ["adventure", "role-playing", "rpg", "visual novel", "interactive fiction"],
  "brain-off": ["arcade", "casual", "platformer", "shooter", "indie"],
  hard: ["action", "fighting", "shooter", "strategy", "souls-like", "roguelike"],
  cozy: ["simulation", "puzzle", "casual", "family", "indie", "adventure"]
};

const SCORE_CONFIG = {
  popularityMaxContribution: {
    personalized: 10,
    fallback: 14
  },
  interactionLikeWeight: {
    personalized: 5,
    fallback: 4
  },
  interactionPlayedWeight: {
    personalized: 2,
    fallback: 1.5
  },
  interactionNotNowWeight: {
    personalized: -3.5,
    fallback: -3
  },
  interactionShownWeight: {
    personalized: -1.2,
    fallback: -1.6
  },
  stateLikedBonus: 8,
  recencyShownPenalty: {
    personalized: -6,
    fallback: -9
  },
  moodGenreMatchWeight: {
    personalized: 5,
    fallback: 4
  },
  moodAffinityWeight: {
    personalized: 1.2,
    fallback: 0.8
  },
  noveltyBonus: {
    personalized: 2.4,
    fallback: 1.5
  },
  diversityGenrePenalty: {
    personalized: 2.2,
    fallback: 1.6
  },
  diversityPrimaryGenrePenalty: {
    personalized: 1.4,
    fallback: 1
  },
  popularityReference: 64
} as const;

type RawgGame = {
  id: number;
  name: string;
  name_original?: string | null;
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

type RawgGameDetail = {
  id: number;
  parent_game?: { id?: number } | null;
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

function fromBaseGameDetailCache(key: string): boolean | null {
  const hit = baseGameDetailCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    baseGameDetailCache.delete(key);
    return null;
  }
  return hit.isBaseGame;
}

function putBaseGameDetailCache(key: string, isBaseGame: boolean) {
  baseGameDetailCache.set(key, {
    expiresAt: Date.now() + DETAIL_CACHE_TTL_MS,
    isBaseGame
  });
}

function externalKey(source: string, id: string): string {
  return `${source}:${id}`;
}

function titleLooksLikeNonBaseGame(title: string): boolean {
  const value = title.trim();
  if (!value) return false;
  return NON_BASE_TITLE_PATTERNS.some((pattern) => pattern.test(value));
}

async function isBaseGameByRawgDetail(params: { apiKey: string; gameId: number; title: string }): Promise<boolean> {
  const { apiKey, gameId, title } = params;
  const cacheKey = String(gameId);
  const cached = fromBaseGameDetailCache(cacheKey);
  if (cached !== null) return cached;

  if (titleLooksLikeNonBaseGame(title)) {
    putBaseGameDetailCache(cacheKey, false);
    return false;
  }

  try {
    const qs = new URLSearchParams({ key: apiKey });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RAWG_DETAIL_TIMEOUT_MS);
    const response = await fetch(`${RAWG_ENDPOINT}/${gameId}?${qs.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
      },
      signal: controller.signal,
      next: { revalidate: 3600 }
    }).finally(() => {
      clearTimeout(timer);
    });

    if (!response.ok) {
      // Fail-open on detail fetch failure to avoid dropping all recommendations.
      const fallback = !titleLooksLikeNonBaseGame(title);
      putBaseGameDetailCache(cacheKey, fallback);
      return fallback;
    }

    const detail = (await response.json()) as RawgGameDetail;
    const isBaseGame = !detail.parent_game?.id;
    putBaseGameDetailCache(cacheKey, isBaseGame);
    return isBaseGame;
  } catch {
    const fallback = !titleLooksLikeNonBaseGame(title);
    putBaseGameDetailCache(cacheKey, fallback);
    return fallback;
  }
}

function hasJapanese(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(text);
}

function toRawgPlatformParam(platforms: string[]): string {
  const ids = normalizeQuery(platforms).flatMap((key) => RAWG_PLATFORM_MAP[key] ?? []);
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

function agePenalty(released: string): number {
  if (!released) return 0;
  const releasedMs = new Date(released).getTime();
  if (Number.isNaN(releasedMs)) return 0;
  const years = (Date.now() - releasedMs) / (365.25 * 24 * 60 * 60 * 1000);
  if (years <= 3) return 0;
  if (years <= 6) return -1.5;
  if (years <= 9) return -4;
  if (years <= 12) return -7;
  return -10;
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
  const name = game.name?.trim() || "";
  const nameOriginal = game.name_original?.trim() || "";
  const titleJa = hasJapanese(name) ? name : hasJapanese(nameOriginal) ? nameOriginal : "";

  const scoreHint =
    rating * 8 +
    Math.min(12, Math.log10(Math.max(1, ratingCount)) * 4) +
    metacritic / 20 +
    recencyBoost(released) +
    agePenalty(released);

  return {
    external_source: "rawg",
    external_game_id: String(game.id),
    title: name || "タイトル不明",
    title_ja: titleJa,
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
    ordering: "-rating",
    lang: "ja"
  });

  const platformParam = toRawgPlatformParam(params.platforms);
  if (platformParam) qs.set("platforms", platformParam);

  const genreParam = toRawgGenreParam(params.genres);
  if (genreParam) qs.set("genres", genreParam);

  try {
    const response = await fetch(`${RAWG_ENDPOINT}?${qs.toString()}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
      },
      next: { revalidate: 300 }
    });

    if (!response.ok) {
      const failure = { games: [], error: `外部API取得に失敗しました (${response.status})` };
      putCache(key, failure);
      return failure;
    }

    const payload = (await response.json()) as RawgResponse;
    const rawGames = payload.results ?? [];
    const baseFlags = await Promise.all(
      rawGames.map((game) =>
        isBaseGameByRawgDetail({
          apiKey,
          gameId: game.id,
          title: game.name ?? ""
        })
      )
    );
    const games = rawGames.filter((_, index) => baseFlags[index]).map(mapRawgGame);
    const success = { games };
    putCache(key, success);
    return success;
  } catch {
    const failure = { games: [], error: "外部APIへの接続でエラーが発生しました" };
    putCache(key, failure);
    return failure;
  }
}

function collectHistory(interactions: Interaction[]): Map<string, Interaction[]> {
  const byKey = new Map<string, Interaction[]>();
  for (const interaction of interactions) {
    if (!interaction.external_source || !interaction.external_game_id) continue;
    const key = externalKey(interaction.external_source, interaction.external_game_id);
    const current = byKey.get(key) ?? [];
    current.push(interaction);
    byKey.set(key, current);
  }
  return byKey;
}

function collectStates(states: UserGameState[]): Map<string, UserGameState> {
  const map = new Map<string, UserGameState>();
  for (const state of states) {
    map.set(externalKey(state.external_source, state.external_game_id), state);
  }
  return map;
}

function latestShownAt(history: Interaction[]): number | null {
  const shown = history
    .filter((item) => item.action === "shown")
    .map((item) => new Date(item.created_at).getTime())
    .filter((value) => !Number.isNaN(value));
  if (shown.length === 0) return null;
  return Math.max(...shown);
}

type RankedExplanation = {
  game: ExternalGame;
  score: number;
  reasons: string[];
  matchedMoodKeys: string[];
};

type RankingMode = "personalized" | "fallback";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeMoodTags(moodTags: string[]): string[] {
  return Array.from(
    new Set(
      moodTags
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function normalizeGenreTags(genreTags: string[]): string[] {
  return Array.from(
    new Set(
      genreTags
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function pickWeight(mode: RankingMode, key: keyof typeof SCORE_CONFIG): number {
  const value = SCORE_CONFIG[key];
  if (typeof value === "number") return value;
  return mode === "personalized" ? value.personalized : value.fallback;
}

function moodKeysForGame(game: ExternalGame): string[] {
  const genres = normalizeGenreTags(game.genre_tags);
  if (genres.length === 0) return [];

  const matched: string[] = [];
  for (const [moodKey, hints] of Object.entries(MOOD_GENRE_HINTS)) {
    const isMatch = hints.some((hint) => genres.some((genre) => genre.includes(hint) || hint.includes(genre)));
    if (isMatch) matched.push(moodKey);
  }
  return matched;
}

function collectMoodAffinity(interactions: Interaction[]): Map<string, number> {
  const map = new Map<string, number>();

  for (const item of interactions) {
    const tags = parseTags(item.context_tags ?? "");
    if (tags.length === 0) continue;

    let actionScore = 0;
    if (item.action === "like") actionScore = 2;
    if (item.action === "played") actionScore = 1;
    if (item.action === "not_now") actionScore = -1;
    if (item.action === "dont_recommend") actionScore = -3;
    if (actionScore === 0) continue;

    for (const tag of tags) {
      const current = map.get(tag) ?? 0;
      map.set(tag, current + actionScore);
    }
  }

  return map;
}

function preferredMoodTags(inputMoodTags: string[], moodAffinity: Map<string, number>): string[] {
  const normalized = normalizeMoodTags(inputMoodTags);
  if (normalized.length > 0) return normalized;

  return Array.from(moodAffinity.entries())
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([tag]) => tag);
}

function countOverlap(source: string[], target: string[]): number {
  if (source.length === 0 || target.length === 0) return 0;
  return source.filter((item) => target.includes(item)).length;
}

function primaryGenre(game: ExternalGame): string {
  const first = normalizeGenreTags(game.genre_tags)[0];
  return first ?? "unknown";
}

function scoreGame(params: {
  game: ExternalGame;
  history: Interaction[];
  state: UserGameState | undefined;
  moodTags: string[];
  moodAffinity: Map<string, number>;
  mode: RankingMode;
}): RankedExplanation | null {
  const { game, history, state, moodTags, moodAffinity, mode } = params;

  if (state?.dont_recommend) return null;
  if (state?.played) return null;
  if (state?.disliked) return null;

  const reasons: string[] = [];
  let score = 0;

  const popularityRaw = clamp(game.score_hint / SCORE_CONFIG.popularityReference, 0, 1);
  const popularityContribution = popularityRaw * pickWeight(mode, "popularityMaxContribution");
  score += popularityContribution;
  reasons.push(`人気補助 +${popularityContribution.toFixed(1)}`);

  const likeCount = history.filter((item) => item.action === "like").length;
  const playedCount = history.filter((item) => item.action === "played").length;
  const notNowCount = history.filter((item) => item.action === "not_now").length;
  const shownCount = history.filter((item) => item.action === "shown").length;

  if (state?.liked) {
    score += SCORE_CONFIG.stateLikedBonus;
    reasons.push(`棚の「好き」 +${SCORE_CONFIG.stateLikedBonus.toFixed(1)}`);
  }

  if (likeCount > 0) {
    const delta = Math.min(3, likeCount) * pickWeight(mode, "interactionLikeWeight");
    score += delta;
    reasons.push(`like履歴 +${delta.toFixed(1)}`);
  }

  if (playedCount > 0) {
    const delta = Math.min(2, playedCount) * pickWeight(mode, "interactionPlayedWeight");
    score += delta;
    reasons.push(`played履歴 +${delta.toFixed(1)}`);
  }

  if (notNowCount > 0) {
    const delta = Math.min(3, notNowCount) * pickWeight(mode, "interactionNotNowWeight");
    score += delta;
    reasons.push(`not_now履歴 ${delta.toFixed(1)}`);
  }

  if (shownCount > 0) {
    const delta = Math.min(4, shownCount) * pickWeight(mode, "interactionShownWeight");
    score += delta;
    reasons.push(`shown回数 ${delta.toFixed(1)}`);
  }

  const lastShown = latestShownAt(history);
  if (lastShown) {
    const elapsed = Date.now() - lastShown;
    if (elapsed < SHOWN_COOLDOWN_MS) {
      const delta = pickWeight(mode, "recencyShownPenalty");
      score += delta;
      reasons.push(`直近表示ペナルティ ${delta.toFixed(1)}`);
    }
  }

  const matchedMoodKeys = moodKeysForGame(game);
  const moodMatchCount = countOverlap(matchedMoodKeys, moodTags);
  if (moodMatchCount > 0) {
    const delta = moodMatchCount * pickWeight(mode, "moodGenreMatchWeight");
    score += delta;
    reasons.push(`気分一致 +${delta.toFixed(1)} (${moodMatchCount}件)`);
  }

  if (matchedMoodKeys.length > 0) {
    const affinityRaw = matchedMoodKeys.reduce((sum, key) => sum + (moodAffinity.get(key) ?? 0), 0);
    if (affinityRaw !== 0) {
      const delta = clamp(affinityRaw, -4, 4) * pickWeight(mode, "moodAffinityWeight");
      score += delta;
      reasons.push(`ユーザー気分傾向 ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`);
    }
  }

  if (history.length === 0) {
    const delta = pickWeight(mode, "noveltyBonus");
    score += delta;
    reasons.push(`未接触ボーナス +${delta.toFixed(1)}`);
  }

  return {
    game,
    score,
    reasons,
    matchedMoodKeys
  };
}

function diversifyRankings(params: {
  scored: RankedExplanation[];
  limit: number;
  mode: RankingMode;
}): RankedExplanation[] {
  const { scored, limit, mode } = params;
  const remaining = [...scored].sort((a, b) => b.score - a.score);
  const selected: RankedExplanation[] = [];
  const selectedGenres = new Map<string, number>();

  while (remaining.length > 0 && selected.length < Math.max(0, limit)) {
    let bestIndex = 0;
    let bestAdjusted = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      const genres = normalizeGenreTags(candidate.game.genre_tags);
      const overlapCount = genres.reduce((sum, tag) => sum + (selectedGenres.has(tag) ? 1 : 0), 0);
      const primary = primaryGenre(candidate.game);
      const primaryUsed = selectedGenres.get(primary) ?? 0;

      const diversityPenalty =
        overlapCount * pickWeight(mode, "diversityGenrePenalty") +
        primaryUsed * pickWeight(mode, "diversityPrimaryGenrePenalty");
      const adjusted = candidate.score - diversityPenalty;

      if (adjusted > bestAdjusted) {
        bestAdjusted = adjusted;
        bestIndex = i;
      }
    }

    const [picked] = remaining.splice(bestIndex, 1);
    selected.push(picked);
    for (const genre of normalizeGenreTags(picked.game.genre_tags)) {
      selectedGenres.set(genre, (selectedGenres.get(genre) ?? 0) + 1);
    }
  }

  return selected;
}

function rank(params: {
  games: ExternalGame[];
  interactions: Interaction[];
  userStates: UserGameState[];
  moodTags: string[];
  limit: number;
  mode: RankingMode;
}): RankedExplanation[] {
  const { games, interactions, userStates, moodTags, limit, mode } = params;
  const historyByKey = collectHistory(interactions);
  const stateByKey = collectStates(userStates);
  const moodAffinity = collectMoodAffinity(interactions);
  const effectiveMoodTags = preferredMoodTags(moodTags, moodAffinity);

  const scored = games
    .map((game) => {
      const key = externalKey(game.external_source, game.external_game_id);
      return scoreGame({
        game,
        history: historyByKey.get(key) ?? [],
        state: stateByKey.get(key),
        moodTags: effectiveMoodTags,
        moodAffinity,
        mode
      });
    })
    .filter((item): item is RankedExplanation => item !== null);

  return diversifyRankings({ scored, limit, mode });
}

export function explainRankedExternalGames(params: {
  games: ExternalGame[];
  interactions: Interaction[];
  userStates: UserGameState[];
  moodTags: string[];
  limit: number;
  personalized: boolean;
}): RankedExplanation[] {
  return rank({
    games: params.games,
    interactions: params.interactions,
    userStates: params.userStates,
    moodTags: params.moodTags,
    limit: params.limit,
    mode: params.personalized ? "personalized" : "fallback"
  });
}

export function rankExternalGames(params: {
  games: ExternalGame[];
  interactions: Interaction[];
  userStates: UserGameState[];
  moodTags: string[];
  limit: number;
}): ExternalGame[] {
  return explainRankedExternalGames({
    games: params.games,
    interactions: params.interactions,
    userStates: params.userStates,
    moodTags: params.moodTags,
    limit: params.limit,
    personalized: false
  }).map((item) => item.game);
}

export function rankPersonalizedExternalGames(params: {
  games: ExternalGame[];
  interactions: Interaction[];
  userStates: UserGameState[];
  moodTags: string[];
  limit: number;
}): ExternalGame[] {
  return explainRankedExternalGames({
    games: params.games,
    interactions: params.interactions,
    userStates: params.userStates,
    moodTags: params.moodTags,
    limit: params.limit,
    personalized: true
  }).map((item) => item.game);
}

export function getShownCooldownHours(): number {
  return SHOWN_COOLDOWN_HOURS;
}

