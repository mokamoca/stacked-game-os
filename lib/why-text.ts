type WhyTextInput = {
  game: {
    title: string;
    releaseYear: number | null;
    genres: string[];
    platforms: string[];
    summaryShort: string;
  };
  filter: {
    eraMode: "ps4_plus" | "retro_included";
    genreCodes: string[] | null;
    platformCodes: string[] | null;
  };
  trend: {
    playedTopGenres: string[];
    wishlistTopGenres: string[];
    blockedTopGenres: string[];
  };
};

const MODEL = "gpt-4o-mini";
const MIN_LEN = 80;
const MAX_LEN = 140;

function fallbackWhyText(input: WhyTextInput): string {
  const genres = input.game.genres.slice(0, 2).join("・") || "幅広いジャンル";
  const platforms = input.game.platforms.slice(0, 2).join(" / ") || "複数プラットフォーム";
  const year =
    input.game.releaseYear == null
      ? "年代情報が未登録ですが"
      : `${input.game.releaseYear}年発売で`;

  const text = `${input.game.title}は${genres}の要素が分かりやすく、${platforms}で遊びやすい1本です。${year}今の条件でも試しやすい候補として提案します。`;
  return text.slice(0, MAX_LEN);
}

function isLengthOk(text: string): boolean {
  const length = text.trim().length;
  return length >= MIN_LEN && length <= MAX_LEN;
}

async function generateOnce(input: WhyTextInput): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "あなたはゲーム推薦の説明文ライターです。日本語で80〜140字、押し付けない口調、具体語を1〜2個含めてください。JSONのみ返してください。"
        },
        {
          role: "user",
          content: JSON.stringify({
            output_schema: { why_text: "string(80-140 chars)" },
            input
          })
        }
      ]
    })
  });

  if (!response.ok) return null;
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as { why_text?: string };
    const text = parsed.why_text?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function generateWhyText(input: WhyTextInput): Promise<string> {
  try {
    const first = await generateOnce(input);
    if (first && isLengthOk(first)) return first;

    const second = await generateOnce(input);
    if (second && isLengthOk(second)) return second;
  } catch {
    // Fall through to fallback text.
  }

  return fallbackWhyText(input);
}
