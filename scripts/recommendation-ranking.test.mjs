import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
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
    throw new Error(`Unsupported import in test loader: ${specifier}`);
  };

  const fn = new Function("require", "module", "exports", transpiled);
  fn(localRequire, module, module.exports);
  return module.exports;
}

function buildGames() {
  return [
    {
      external_source: "rawg",
      external_game_id: "g1",
      title: "Hard Ops",
      title_ja: "",
      platform: "PC",
      genre_tags: ["action", "shooter"],
      image_url: "",
      score_hint: 62,
      rating: 4.9,
      metacritic: 88,
      ratings_count: 3200,
      released: "2024-10-01"
    },
    {
      external_source: "rawg",
      external_game_id: "g2",
      title: "Cozy Garden",
      title_ja: "",
      platform: "PC",
      genre_tags: ["simulation", "casual"],
      image_url: "",
      score_hint: 41,
      rating: 4.1,
      metacritic: 78,
      ratings_count: 800,
      released: "2024-07-10"
    },
    {
      external_source: "rawg",
      external_game_id: "g3",
      title: "Story Echoes",
      title_ja: "",
      platform: "PS5",
      genre_tags: ["adventure", "role-playing"],
      image_url: "",
      score_hint: 49,
      rating: 4.5,
      metacritic: 85,
      ratings_count: 1400,
      released: "2023-12-20"
    },
    {
      external_source: "rawg",
      external_game_id: "g4",
      title: "Arena Clash",
      title_ja: "",
      platform: "PS5",
      genre_tags: ["action", "fighting"],
      image_url: "",
      score_hint: 60,
      rating: 4.8,
      metacritic: 90,
      ratings_count: 2500,
      released: "2024-09-18"
    }
  ];
}

function mkInteraction(gameId, action, contextTags) {
  return {
    id: `${gameId}-${action}-${contextTags}`,
    user_id: "u",
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

const mod = loadExternalGamesModule();

const tests = [
  {
    name: "mood tag match boosts candidates over pure popularity",
    run: () => {
      const ranked = mod.rankPersonalizedExternalGames({
        games: buildGames(),
        interactions: [],
        userStates: [],
        moodTags: ["cozy"],
        limit: 3
      });
      const indexCozy = ranked.findIndex((item) => item.external_game_id === "g2");
      const indexHard = ranked.findIndex((item) => item.external_game_id === "g1");
      assert.ok(indexCozy >= 0 && indexHard >= 0 && indexCozy < indexHard);
    }
  },
  {
    name: "top results are not fixed to only highest-rated action games",
    run: () => {
      const ranked = mod.rankExternalGames({
        games: buildGames(),
        interactions: [],
        userStates: [],
        moodTags: ["cozy"],
        limit: 3
      });
      const topGenres = ranked.slice(0, 3).flatMap((item) => item.genre_tags);
      assert.ok(topGenres.includes("simulation") || topGenres.includes("adventure"));
    }
  },
  {
    name: "recommendations differ by user history",
    run: () => {
      const games = buildGames();
      const hardUser = mod.rankPersonalizedExternalGames({
        games,
        interactions: [mkInteraction("g1", "like", "hard"), mkInteraction("g4", "played", "hard")],
        userStates: [],
        moodTags: [],
        limit: 3
      });
      const cozyUser = mod.rankPersonalizedExternalGames({
        games,
        interactions: [mkInteraction("g2", "like", "cozy"), mkInteraction("g3", "played", "story")],
        userStates: [],
        moodTags: [],
        limit: 3
      });
      assert.notEqual(hardUser[0].external_game_id, cozyUser[0].external_game_id);
    }
  }
];

const failures = [];
for (const testCase of tests) {
  try {
    testCase.run();
    console.log(`PASS ${testCase.name}`);
  } catch (error) {
    failures.push({ name: testCase.name, error });
    console.error(`FAIL ${testCase.name}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (failures.length > 0) {
  process.exitCode = 1;
}


