import type { Game, Interaction } from "@/lib/types";
import { parseTags } from "@/lib/tags";

type Recommendation = {
  game: Game;
  score: number;
  shownCount: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeTags(raw: string): string[] {
  return parseTags(raw);
}

function hasTagOverlap(currentTags: string[], rawContextTags: string): boolean {
  if (currentTags.length === 0) return true;

  const contextTags = parseTags(rawContextTags);
  if (contextTags.length === 0) return true;

  return currentTags.some((tag) =>
    contextTags.some((contextTag) => contextTag.includes(tag) || tag.includes(contextTag))
  );
}

export function recommendGames(params: {
  games: Game[];
  interactions: Interaction[];
  moodTags: string;
}): Recommendation[] {
  const { games, interactions, moodTags } = params;
  const moodTagList = normalizeTags(moodTags);
  const now = Date.now();

  const byGame = new Map<string, Interaction[]>();
  for (const interaction of interactions) {
    const current = byGame.get(interaction.game_id) ?? [];
    current.push(interaction);
    byGame.set(interaction.game_id, current);
  }

  const ranked: Recommendation[] = [];

  for (const game of games) {
    const history = byGame.get(game.id) ?? [];

    if (history.some((item) => item.action === "dont_recommend")) {
      continue;
    }

    let score = 0;

    const likeCount = history.filter((item) => item.action === "like").length;
    score += likeCount * 4;

    const playedRecently = history.some((item) => {
      if (item.action !== "played") return false;
      if (!hasTagOverlap(moodTagList, item.context_tags)) return false;
      const diff = now - new Date(item.created_at).getTime();
      return diff <= 3 * DAY_MS;
    });
    if (playedRecently) score -= 12;

    const notNowRecently = history.some((item) => {
      if (item.action !== "not_now") return false;
      if (!hasTagOverlap(moodTagList, item.context_tags)) return false;
      const diff = now - new Date(item.created_at).getTime();
      return diff <= 1 * DAY_MS;
    });
    if (notNowRecently) score -= 6;

    const gameTags = game.tags;
    const matchedTagCount = moodTagList.filter((moodTag) =>
      gameTags.some((gameTag) => gameTag.includes(moodTag) || moodTag.includes(gameTag))
    ).length;
    score += matchedTagCount * 3;

    const shownCount = history.filter((item) => item.action === "shown").length;

    ranked.push({ game, score, shownCount });
  }

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.shownCount !== b.shownCount) return a.shownCount - b.shownCount;
    return new Date(a.game.created_at).getTime() - new Date(b.game.created_at).getTime();
  });

  return ranked.slice(0, 3);
}
