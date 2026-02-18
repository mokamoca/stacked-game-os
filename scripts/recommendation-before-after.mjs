import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

function parseTags(raw) {
  const seen = new Set();
  const tags = [];
  for (const part of String(raw ?? "").split(",")) {
    const value = part.trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    tags.push(value);
  }
  return tags;
}

function loadExternalGamesModule() {
  const filePath = path.resolve("lib/external-games.ts");
  const source = readFileSync(filePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: filePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
      skipLibCheck: true
    }
  }).outputText;

  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier === "@/lib/tags") return { parseTags };
    if (specifier === "@/lib/types") return {};
    throw new Error(`Unsupported import in script loader: ${specifier}`);
  };

  const fn = new Function("require", "module", "exports", transpiled);
  fn(localRequire, module, module.exports);
  return module.exports;
}

function legacyRank({ games, interactions, userStates, limit, personalized }) {
  const byKey = new Map();
  for (const interaction of interactions) {
    const key = `${interaction.external_source}:${interaction.external_game_id}`;
    const current = byKey.get(key) ?? [];
    current.push(interaction);
    byKey.set(key, current);
  }

  const stateByKey = new Map();
  for (const state of userStates) {
    stateByKey.set(`${state.external_source}:${state.external_game_id}`, state);
  }

  const scored = [];
  for (const game of games) {
    const key = `${game.external_source}:${game.external_game_id}`;
    const history = byKey.get(key) ?? [];
    const state = stateByKey.get(key);

    if (state?.dont_recommend || state?.played || state?.disliked) continue;

    let score = game.score_hint;
    const likeCount = history.filter((x) => x.action === "like").length;
    const playedCount = history.filter((x) => x.action === "played").length;
    const notNowCount = history.filter((x) => x.action === "not_now").length;
    const shownCount = history.filter((x) => x.action === "shown").length;

    if (state?.liked) score += 8;
    score += likeCount * (personalized ? 10 : 7);
    score += playedCount * (personalized ? 4 : 2);
    score -= notNowCount * (personalized ? 8 : 5);
    score -= shownCount * (personalized ? 0.2 : 0.8);

    scored.push({ game, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

function gamesFixture() {
  return [
    { external_source: "rawg", external_game_id: "g1", title: "Hard Ops", title_ja: "", platform: "PC", genre_tags: ["action", "shooter"], image_url: "", score_hint: 62, rating: 4.9, metacritic: 88, ratings_count: 3200, released: "2024-10-01" },
    { external_source: "rawg", external_game_id: "g2", title: "Cozy Garden", title_ja: "", platform: "PC", genre_tags: ["simulation", "casual"], image_url: "", score_hint: 41, rating: 4.1, metacritic: 78, ratings_count: 800, released: "2024-07-10" },
    { external_source: "rawg", external_game_id: "g3", title: "Story Echoes", title_ja: "", platform: "PS5", genre_tags: ["adventure", "role-playing"], image_url: "", score_hint: 49, rating: 4.5, metacritic: 85, ratings_count: 1400, released: "2023-12-20" },
    { external_source: "rawg", external_game_id: "g4", title: "Arena Clash", title_ja: "", platform: "PS5", genre_tags: ["action", "fighting"], image_url: "", score_hint: 60, rating: 4.8, metacritic: 90, ratings_count: 2500, released: "2024-09-18" },
    { external_source: "rawg", external_game_id: "g5", title: "Indie Breather", title_ja: "", platform: "Switch", genre_tags: ["indie", "puzzle"], image_url: "", score_hint: 36, rating: 3.9, metacritic: 74, ratings_count: 560, released: "2025-03-20" }
  ];
}

function mkInteraction(userId, gameId, action, contextTags) {
  return {
    id: `${userId}-${gameId}-${action}-${contextTags}`,
    user_id: userId,
    game_id: null,
    external_source: "rawg",
    external_game_id: gameId,
    game_title_snapshot: gameId,
    action,
    time_bucket: 30,
    context_tags: contextTags,
    created_at: "2026-02-15T00:00:00.000Z"
  };
}

const users = [
  {
    id: "user_chill",
    moodTags: ["cozy"],
    interactions: [mkInteraction("user_chill", "g2", "like", "cozy,chill"), mkInteraction("user_chill", "g1", "not_now", "hard")],
    userStates: []
  },
  {
    id: "user_hard",
    moodTags: ["hard"],
    interactions: [mkInteraction("user_hard", "g1", "like", "hard"), mkInteraction("user_hard", "g4", "played", "hard")],
    userStates: []
  },
  {
    id: "user_story",
    moodTags: ["story"],
    interactions: [mkInteraction("user_story", "g3", "like", "story"), mkInteraction("user_story", "g4", "not_now", "hard")],
    userStates: [
      {
        id: "s1",
        user_id: "user_story",
        external_source: "rawg",
        external_game_id: "g1",
        game_title_snapshot: "Hard Ops",
        liked: false,
        played: false,
        disliked: true,
        dont_recommend: false,
        created_at: "2026-02-10T00:00:00.000Z",
        updated_at: "2026-02-10T00:00:00.000Z"
      }
    ]
  }
];

const mod = loadExternalGamesModule();
const games = gamesFixture();

const report = users.map((user) => {
  const before = legacyRank({
    games,
    interactions: user.interactions,
    userStates: user.userStates,
    limit: 3,
    personalized: true
  }).map((item) => ({ id: item.game.external_game_id, title: item.game.title, score: Number(item.score.toFixed(2)) }));

  const after = mod.explainRankedExternalGames({
    games,
    interactions: user.interactions,
    userStates: user.userStates,
    moodTags: user.moodTags,
    limit: 3,
    personalized: true
  }).map((item) => ({
    id: item.game.external_game_id,
    title: item.game.title,
    score: Number(item.score.toFixed(2)),
    reasons: item.reasons.slice(0, 3)
  }));

  return {
    user: user.id,
    mood_tags: user.moodTags,
    before,
    after
  };
});

console.log(JSON.stringify({ measured_at: new Date().toISOString(), report }, null, 2));
