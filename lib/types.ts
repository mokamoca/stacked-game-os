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
  mood_tags: string;
  created_at: string;
};

export type Interaction = {
  id: string;
  user_id: string;
  game_id: string;
  action: InteractionAction;
  time_bucket: number;
  context_tags: string;
  created_at: string;
};
