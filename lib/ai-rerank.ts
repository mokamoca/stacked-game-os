import type { Interaction, InteractionAction, UserGameState } from "@/lib/types";

type AIRerankCandidate = {
  id: string;
  title: string;
  platform: string;
  genres: string[];
  rating: number;
  released: string;
};

type AIRerankParams = {
  candidates: AIRerankCandidate[];
  moodPresets: string[];
  platformFilters: string[];
  genreFilters: string[];
  interactions: Interaction[];
  userStates: UserGameState[];
};

export type AIRerankOutput = {
  rankedIds: string[];
  reasons: Record<string, string>;
  error?: string;
};

type HistorySummary = {
  action: InteractionAction;
  title: string;
  count: number;
};

type OpenAIErrorPayload = {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
};

function compactDate(value: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function summarizeInteractions(interactions: Interaction[]): HistorySummary[] {
  const map = new Map<string, HistorySummary>();
  for (const row of interactions) {
    if (!row.game_title_snapshot) continue;
    if (row.action === "shown") continue;
    const key = `${row.action}:${row.game_title_snapshot}`;
    const current = map.get(key);
    if (current) {
      current.count += 1;
    } else {
      map.set(key, {
        action: row.action,
        title: row.game_title_snapshot,
        count: 1
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

function summarizeStates(userStates: UserGameState[]) {
  return userStates.slice(0, 120).map((item) => ({
    title: item.game_title_snapshot,
    liked: item.liked,
    played: item.played,
    disliked: item.disliked,
    dont_recommend: item.dont_recommend
  }));
}

function sanitizeReason(value: string): string {
  const text = value.trim();
  if (!text) return "履歴と条件に合うため";
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

function parseOpenAIError(raw: string): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as OpenAIErrorPayload;
    const message = parsed.error?.message?.trim() ?? "";
    const type = parsed.error?.type?.trim() ?? "";
    const code = parsed.error?.code?.trim() ?? "";
    const detail = [code, type, message].filter(Boolean).join(" / ");
    return detail || "";
  } catch {
    return raw.slice(0, 160).trim();
  }
}

export async function rerankWithAI(params: AIRerankParams): Promise<AIRerankOutput> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      rankedIds: params.candidates.map((item) => item.id),
      reasons: {},
      error: "OPENAI_API_KEY が未設定のためAI再ランキングをスキップしました"
    };
  }

  if (params.candidates.length === 0) {
    return { rankedIds: [], reasons: {} };
  }

  const summary = summarizeInteractions(params.interactions);
  const shelfSummary = summarizeStates(params.userStates);

  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたはゲーム推薦ランカーです。未プレイ候補を優先し、候補を順位付けしてください。必ずJSONのみを返し、余計な文字を含めないでください。"
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "候補IDを重複なく並べ替える",
          output_schema: {
            ranked: [{ id: "candidate_id", reason: "1行理由", score: 0 }]
          },
          context: {
            mood_presets: params.moodPresets,
            platform_filters: params.platformFilters,
            genre_filters: params.genreFilters,
            interaction_summary: summary,
            user_game_shelf: shelfSummary
          },
          candidates: params.candidates.map((item) => ({
            id: item.id,
            title: item.title,
            platform: item.platform,
            genres: item.genres,
            rating: item.rating,
            released: compactDate(item.released)
          }))
        })
      }
    ]
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const rawBody = await response.text();
      const detail = parseOpenAIError(rawBody);
      return {
        rankedIds: params.candidates.map((item) => item.id),
        reasons: {},
        error: detail
          ? `AI再ランキングに失敗しました (${response.status}): ${detail}`
          : `AI再ランキングに失敗しました (${response.status})`
      };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return {
        rankedIds: params.candidates.map((item) => item.id),
        reasons: {},
        error: "AI応答が空のため既存ランキングを使用しました"
      };
    }

    const parsed = JSON.parse(content) as {
      ranked?: Array<{ id?: string; reason?: string; score?: number }>;
    };

    const validIds = new Set(params.candidates.map((item) => item.id));
    const ranked: string[] = [];
    const reasons: Record<string, string> = {};

    for (const item of parsed.ranked ?? []) {
      const id = typeof item.id === "string" ? item.id : "";
      if (!id || !validIds.has(id) || ranked.includes(id)) continue;
      ranked.push(id);
      if (typeof item.reason === "string") {
        reasons[id] = sanitizeReason(item.reason);
      }
    }

    for (const fallback of params.candidates) {
      if (!ranked.includes(fallback.id)) ranked.push(fallback.id);
    }

    return { rankedIds: ranked, reasons };
  } catch (error) {
    return {
      rankedIds: params.candidates.map((item) => item.id),
      reasons: {},
      error:
        error instanceof Error
          ? `AI再ランキング中にエラーが発生したため既存ランキングを使用しました: ${error.message}`
          : "AI再ランキング中にエラーが発生したため既存ランキングを使用しました"
    };
  }
}
