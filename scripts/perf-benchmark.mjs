import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";

function loadEnv(path = ".env.local") {
  const text = readFileSync(path, "utf8");
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return env;
}

const env = loadEnv();
const RAWG_API_KEY = env.RAWG_API_KEY;
const OPENAI_API_KEY = env.OPENAI_API_KEY;

if (!RAWG_API_KEY || !OPENAI_API_KEY) {
  console.error("RAWG_API_KEY or OPENAI_API_KEY missing in .env.local");
  process.exit(1);
}

const RAWG_ENDPOINT = "https://api.rawg.io/api/games";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function timeoutSignal(ms) {
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

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
  /extra\s*content/i,
  /expansion\s*pack/i
];

function titleLooksLikeNonBaseGame(title) {
  const value = (title || "").trim();
  if (!value) return false;
  return NON_BASE_TITLE_PATTERNS.some((pattern) => pattern.test(value));
}

async function fetchList() {
  const qs = new URLSearchParams({
    key: RAWG_API_KEY,
    page_size: "24",
    ordering: "-rating",
    lang: "ja"
  });
  const t0 = performance.now();
  const res = await fetch(`${RAWG_ENDPOINT}?${qs.toString()}`, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    }
  });
  const t1 = performance.now();
  const body = await res.json();
  return { ms: t1 - t0, games: body.results || [] };
}

async function detailIsBase(gameId, title, timeoutMs = 0) {
  if (titleLooksLikeNonBaseGame(title)) return false;
  const qs = new URLSearchParams({ key: RAWG_API_KEY });
  try {
    const res = await fetch(`${RAWG_ENDPOINT}/${gameId}?${qs.toString()}`, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
      },
      signal: timeoutMs > 0 ? timeoutSignal(timeoutMs) : undefined
    });
    if (!res.ok) return !titleLooksLikeNonBaseGame(title);
    const body = await res.json();
    return !body.parent_game?.id;
  } catch {
    return !titleLooksLikeNonBaseGame(title);
  }
}

async function baselineRawg(games) {
  const t0 = performance.now();
  const flags = await Promise.all(games.map((g) => detailIsBase(g.id, g.name || "", 0)));
  const t1 = performance.now();
  return { ms: t1 - t0, count: flags.filter(Boolean).length };
}

async function withConcurrency(items, limit, fn) {
  const out = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) break;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function optimizedRawg(games) {
  const t0 = performance.now();
  const titleFiltered = games.filter((g) => !titleLooksLikeNonBaseGame(g.name || ""));
  const verifyTargets = titleFiltered.slice(0, 12);
  const remain = titleFiltered.slice(12);
  const verified = await withConcurrency(verifyTargets, 4, (g) => detailIsBase(g.id, g.name || "", 1200));
  const baseCount = verified.filter(Boolean).length + remain.length;
  const t1 = performance.now();
  return { ms: t1 - t0, count: baseCount };
}

function buildCandidates(games, n) {
  return games.slice(0, n).map((g) => ({
    id: `rawg:${g.id}`,
    title: g.name || "",
    platform: (g.platforms || []).map((x) => x.platform?.name).filter(Boolean).join(", "),
    genres: (g.genres || []).map((x) => (x.name || "").toLowerCase()).filter(Boolean),
    rating: typeof g.rating === "number" ? g.rating : 0,
    released: g.released || ""
  }));
}

async function callOpenAI(candidates) {
  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a ranking assistant. Return JSON only with ranked candidate ids and short reasons."
      },
      {
        role: "user",
        content: JSON.stringify({
          output_schema: { ranked: [{ id: "candidate_id", reason: "short", score: 0 }] },
          context: {
            mood_presets: ["chill"],
            platform_filters: [],
            genre_filters: [],
            interaction_summary: [],
            user_game_shelf: []
          },
          candidates
        })
      }
    ]
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}`);
  await res.text();
}

async function baselineAi(games) {
  const c18 = buildCandidates(games, 18);
  const t0 = performance.now();
  await callOpenAI(c18);
  await sleep(150);
  await callOpenAI(c18);
  const t1 = performance.now();
  return { ms: t1 - t0 };
}

async function optimizedAi(games) {
  const c12 = buildCandidates(games, 12);
  const t0 = performance.now();
  await Promise.all([callOpenAI(c12), callOpenAI(c12)]);
  const t1 = performance.now();
  return { ms: t1 - t0 };
}

(async () => {
  const list = await fetchList();
  const baselineRawgRes = await baselineRawg(list.games);
  const optimizedRawgRes = await optimizedRawg(list.games);
  const baselineAiRes = await baselineAi(list.games);
  const optimizedAiRes = await optimizedAi(list.games);

  const result = {
    measured_at: new Date().toISOString(),
    rawg_list_ms: Number(list.ms.toFixed(1)),
    rawg_baseline_ms: Number(baselineRawgRes.ms.toFixed(1)),
    rawg_optimized_ms: Number(optimizedRawgRes.ms.toFixed(1)),
    rawg_saved_ms: Number((baselineRawgRes.ms - optimizedRawgRes.ms).toFixed(1)),
    ai_baseline_ms: Number(baselineAiRes.ms.toFixed(1)),
    ai_optimized_ms: Number(optimizedAiRes.ms.toFixed(1)),
    ai_saved_ms: Number((baselineAiRes.ms - optimizedAiRes.ms).toFixed(1))
  };

  console.log(JSON.stringify(result, null, 2));
})();
