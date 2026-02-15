export type InteractionAction =
  | "like"
  | "played"
  | "not_now"
  | "dont_recommend"
  | "shown";

export type Game = {
  id: string;
  user_id: string;
  title: string;
  platform: string;
  tags: string[];
  genre_tags: string[];
  created_at: string;
};

export type Interaction = {
  id: string;
  user_id: string;
  game_id: string | null;
  external_source: string;
  external_game_id: string;
  game_title_snapshot: string;
  action: InteractionAction;
  time_bucket: number;
  context_tags: string;
  created_at: string;
};

export type UserGameState = {
  id: string;
  user_id: string;
  external_source: string;
  external_game_id: string;
  game_title_snapshot: string;
  liked: boolean;
  played: boolean;
  disliked: boolean;
  dont_recommend: boolean;
  created_at: string;
  updated_at: string;
};
