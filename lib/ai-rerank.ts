import type { Interaction, InteractionAction } from "@/lib/types";

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

function sanitizeReason(value: string): string {
  const text = value.trim();
  if (!text) return "履歴と条件に合うため";
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
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

  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "あなたはゲーム推薦ランカーです。候補をユーザー嗜好に合わせて順位付けし、短い日本語理由を1行で返してください。必ずJSONのみを返し、余計な文字を含めないでください。"
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
            history_summary: summary
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
      return {
        rankedIds: params.candidates.map((item) => item.id),
        reasons: {},
        error: `AI再ランキングに失敗しました (${response.status})`
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
  } catch {
    return {
      rankedIds: params.candidates.map((item) => item.id),
      reasons: {},
      error: "AI再ランキング中にエラーが発生したため既存ランキングを使用しました"
    };
  }
}
