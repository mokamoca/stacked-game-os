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
  { code: "quick", label: "短時間で満足" },
  { code: "story", label: "物語に浸る" },
  { code: "brain", label: "頭を使う" },
  { code: "power", label: "無双・爽快" },
  { code: "chill", label: "まったり" },
  { code: "coop", label: "対戦・協力" }
] as const;

export const DISMISS_REASONS = [
  { code: "genre_mismatch", label: "ジャンルが違う" },
  { code: "mood_mismatch", label: "今の気分じゃない" },
  { code: "too_long", label: "重そう・長そう" },
  { code: "already_considered", label: "すでに検討した" }
] as const;
