// Lightweight row types for the Ryder Cup schema. Hand-rolled — generated
// types from `supabase gen types` should replace this once a live project is
// available. Keep this in sync with /supabase/migrations/0003_ryder_cup.sql.

export type Profile = {
  id: string;
  display_name: string;
  email: string | null;
  handicap: number | null;
  created_at: string;
};

export type TripType = "ryder_cup" | "casual";

export type Trip = {
  id: string;
  name: string;
  year: number;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  join_code: string;
  created_by: string | null;
  trip_type: TripType;
  handicap_mode: "simple" | "slope";
  scramble_allowance: { low: number; high: number };
  bonus_threshold: string;
  tie_outcome_label: string;
  points_to_win: number;
  total_points: number;
  archived: boolean;
  active: boolean;
  created_at: string;
};

export type TripAdmin = { trip_id: string; user_id: string; added_at: string };

export type Team = {
  id: string;
  trip_id: string;
  name: string;
  color: string | null;
  captain_id: string | null;
  created_at: string;
};

export type Course = {
  id: string;
  trip_id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
};

export type Tee = {
  id: string;
  course_id: string;
  name: string;
  course_rating: number | null;
  slope: number | null;
  par: number | null;
  created_at: string;
};

export type Hole = {
  id: string;
  course_id: string;
  hole_number: number;
  par: number;
  stroke_index: number;
};

export type HoleYardage = {
  hole_id: string;
  tee_id: string;
  yards: number;
};

export type Player = {
  id: string;
  trip_id: string;
  user_id: string | null;
  email: string | null;
  name: string;
  handicap_index: number;
  tee_id: string | null;
  tee_time: string | null;
  venmo_username: string | null;
  team_id: string | null;
  created_at: string;
};

export type RoundFormat =
  | "scramble"
  | "best_ball_bonus"
  | "singles"
  | "medal"
  | "stableford"
  | "skins"
  | "count_birdies"
  | "match_play"
  | "group_scramble";

export type Round = {
  id: string;
  trip_id: string;
  course_id: string | null;
  day_number: number;
  format: RoundFormat;
  date: string | null;
  points_per_match: number;
};

export type Match = {
  id: string;
  round_id: string;
  match_number: number;
  side_a: string[];
  side_b: string[];
  team_a_id: string | null;
  team_b_id: string | null;
  status: "scheduled" | "in_progress" | "complete";
  result: null | {
    winner: "A" | "B" | "halve";
    points: { a: number; b: number };
    scoreline?: string;
    decided_thru?: number;
  };
  created_at: string;
};

export type Score = {
  id: string;
  round_id: string;
  match_id: string | null;
  team_side: "A" | "B" | null;
  player_id: string | null;
  hole_number: number;
  gross: number;
  net: number | null;
  created_at: string;
  updated_at: string;
};

export type Bet = {
  id: string;
  trip_id: string;
  round_id: string | null;
  type: "match" | "longest_drive" | "closest_to_pin" | "hole_score" | "low_net_round" | "skins" | "other";
  hole_number: number | null;
  amount: number;
  description: string | null;
  status: "open" | "settled" | "cancelled";
  created_by: string | null;
  settled_at: string | null;
  created_at: string;
};

export type BetParticipant = {
  bet_id: string;
  player_id: string;
  is_winner: boolean;
};

export type ActivityEvent = {
  id: string;
  trip_id: string;
  round_id: string | null;
  actor_player_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
};

export type MatchBet = {
  id: string;
  trip_id: string;
  match_id: string;
  placer_player_id: string;
  side: "A" | "B";
  amount: number;
  taker_player_id: string | null;
  taken_at: string | null;
  settled_at: string | null;
  outcome: "placer" | "taker" | "halve" | "cancelled" | null;
  created_at: string;
};

export type PotType = "skins" | "deuces" | "low_net";

export type RoundPotEntry = {
  round_id: string;
  pot_type: PotType;
  player_id: string;
  joined_at: string;
};

export type Photo = {
  id: string;
  trip_id: string;
  uploaded_by: string | null;
  storage_path: string;
  caption: string | null;
  created_at: string;
};

export type Lodging = {
  trip_id: string;
  address: string | null;
  access_code: string | null;
  wifi_ssid: string | null;
  wifi_password: string | null;
  check_in: string | null;
  check_out: string | null;
  notes: string | null;
};

export type PlayerRoundSettings = {
  round_id: string;
  player_id: string;
  tee_id: string | null;
  tee_time: string | null;
};
