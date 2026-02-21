export const ERA_MODES = ["ps4_plus", "retro_included"] as const;
export type EraMode = (typeof ERA_MODES)[number];

export const EVENT_ACTIONS = ["shown", "reroll", "dismiss", "wishlist", "played", "blocked"] as const;
export type EventAction = (typeof EVENT_ACTIONS)[number];

export const GENRE_OPTIONS = [
  { code: "action", label: "アクション" },
  { code: "rpg", label: "RPG" },
  { code: "adventure", label: "アドベンチャー" },
  { code: "simulation", label: "シミュレーション" },
  { code: "strategy", label: "ストラテジー" },
  { code: "puzzle", label: "パズル" },
  { code: "shooting", label: "シューティング" },
  { code: "sports", label: "スポーツ" },
  { code: "racing", label: "レース" },
  { code: "sandbox", label: "サンドボックス" },
  { code: "survival", label: "サバイバル" },
  { code: "roguelike", label: "ローグライク" }
] as const;

export const PLATFORM_OPTIONS = [
  { code: "PS4", label: "PS4" },
  { code: "PS5", label: "PS5" },
  { code: "SWITCH", label: "Switch" },
  { code: "PC", label: "PC" },
  { code: "XBOXONE", label: "Xbox One" },
  { code: "XBOXSERIES", label: "Xbox Series X|S" },
  { code: "IOS", label: "iOS" },
  { code: "ANDROID", label: "Android" }
] as const;

export const MOOD_OPTIONS = [
  { code: "focus", label: "集中したい" },
  { code: "relax", label: "ゆったり" },
  { code: "story", label: "物語重視" },
  { code: "challenge", label: "歯ごたえ" },
  { code: "short", label: "短時間" },
  { code: "coop", label: "誰かと遊ぶ" }
] as const;

export const DISMISS_REASONS = [
  { code: "genre_mismatch", label: "ジャンルが違う" },
  { code: "mood_mismatch", label: "今の気分じゃない" },
  { code: "too_long", label: "重すぎる・長そう" },
  { code: "already_considered", label: "既に検討済み" }
] as const;
