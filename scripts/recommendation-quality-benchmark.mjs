import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";

const RAWG_ENDPOINT = "https://api.rawg.io/api/games";
const MAX_RESULTS = 40;
const INITIAL_MAX_AGE_YEARS = 8;
const OLD_LOW_SIGNAL_AGE_YEARS = 5;
const LOW_SIGNAL_RATINGS_COUNT = 120;

function loadEnv(path = ".env.local") {
  const text = readFileSync(path, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    env[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return env;
}

function recencyBoost(released) {
  if (!released) return 0;
  const releasedMs = new Date(released).getTime();
  if (Number.isNaN(releasedMs)) return 0;
  const days = Math.floor((Date.now() - releasedMs) / (24 * 60 * 60 * 1000));
  if (days < 0) return 0;
  if (days <= 365) return 2;
  if (days <= 365 * 2) return 1;
  return 0;
}

function agePenalty(released) {
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

function scoreOld(game) {
  const rating = typeof game.rating === "number" ? game.rating : 0;
  const ratingsCount = typeof game.ratings_count === "number" ? game.ratings_count : 0;
  const metacritic = typeof game.metacritic === "number" ? game.metacritic : 0;
  return rating * 8 + Math.min(12, Math.log10(Math.max(1, ratingsCount)) * 4) + metacritic / 20 + recencyBoost(game.released);
}

function scoreNew(game) {
  return scoreOld(game) + agePenalty(game.released);
}

function releaseYear(game) {
  if (!game.released) return null;
  const year = new Date(game.released).getFullYear();
  if (!Number.isFinite(year)) return null;
  return year;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function platformBucket(game) {
  const names = (game.platforms ?? []).map((x) => x.platform?.name ?? "");
  if (names.some((n) => n.includes("PlayStation 5"))) return "PS5";
  if (names.some((n) => n.includes("PlayStation 4"))) return "PS4";
  if (names.some((n) => n.includes("Nintendo Switch"))) return "Switch";
  if (names.some((n) => n.includes("PC"))) return "Steam/PC";
  if (names.some((n) => n.includes("Xbox Series"))) return "Xbox Series X|S";
  return "Other";
}

function summarize(games) {
  const years = games.map(releaseYear).filter((v) => typeof v === "number");
  const byPlatform = {};
  for (const game of games) {
    const bucket = platformBucket(game);
    byPlatform[bucket] = (byPlatform[bucket] ?? 0) + 1;
  }
  return {
    count: games.length,
    release_year_median: median(years),
    release_year_min: years.length > 0 ? Math.min(...years) : null,
    platform_breakdown: byPlatform,
    titles: games.map((g) => ({ name: g.name, released: g.released ?? "", score: Number((g._score ?? 0).toFixed(2)) }))
  };
}

function applyInitialFreshnessRules(games) {
  const currentYear = new Date().getFullYear();
  return games.filter((game) => {
    const year = releaseYear(game);
    if (!year) return true;
    const age = currentYear - year;
    if (age > INITIAL_MAX_AGE_YEARS) return false;
    const ratingsCount = typeof game.ratings_count === "number" ? game.ratings_count : 0;
    if (age > OLD_LOW_SIGNAL_AGE_YEARS && ratingsCount < LOW_SIGNAL_RATINGS_COUNT) return false;
    return true;
  });
}

async function fetchRawg(apiKey, platformIds) {
  const qs = new URLSearchParams({
    key: apiKey,
    page_size: String(MAX_RESULTS),
    ordering: "-rating",
    lang: "ja"
  });
  if (platformIds.length > 0) qs.set("platforms", platformIds.join(","));

  const start = performance.now();
  const response = await fetch(`${RAWG_ENDPOINT}?${qs.toString()}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    }
  });
  const fetchMs = performance.now() - start;
  if (!response.ok) throw new Error(`RAWG ${response.status}`);

  const payload = await response.json();
  return { fetchMs, results: payload.results ?? [] };
}

async function run() {
  const env = loadEnv();
  const apiKey = env.RAWG_API_KEY;
  if (!apiKey) throw new Error("RAWG_API_KEY missing");

  const before = await fetchRawg(apiKey, []);
  const beforeStart = performance.now();
  const beforeTop = before.results
    .map((g) => ({ ...g, _score: scoreOld(g) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 7);
  const beforeProcessMs = performance.now() - beforeStart;

  const after = await fetchRawg(apiKey, [187, 7, 4]);
  const afterStart = performance.now();
  const afterTop = applyInitialFreshnessRules(after.results)
    .map((g) => ({ ...g, _score: scoreNew(g) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 7);
  const afterProcessMs = performance.now() - afterStart;

  const output = {
    measured_at: new Date().toISOString(),
    constraints: {
      switch2_rawg_status: "No dedicated RAWG platform id found; mapped as Nintendo Switch approximation",
      default_platforms_after: ["ps5", "switch", "steam"]
    },
    before: {
      latency_ms: Number((before.fetchMs + beforeProcessMs).toFixed(1)),
      ...summarize(beforeTop)
    },
    after: {
      latency_ms: Number((after.fetchMs + afterProcessMs).toFixed(1)),
      ...summarize(afterTop)
    }
  };

  console.log(JSON.stringify(output, null, 2));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
