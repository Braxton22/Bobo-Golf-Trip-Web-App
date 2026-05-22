import { MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { computeLeaderboard } from "@/lib/scoring";
import { Leaderboard } from "@/components/leaderboard";
import { RealtimeRefresher } from "@/components/realtime-refresher";
import { Hero } from "@/components/home/Hero";
import { FeatureCards } from "@/components/home/FeatureCards";
import { SignInBanner } from "@/components/home/SignInBanner";

type MemberRow = {
  profile_id: string;
  handicap: number | null;
  profiles: { id: string; display_name: string | null } | { id: string; display_name: string | null }[] | null;
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The most recent trip visible to this viewer (RLS handles signed-in vs public).
  const { data: trips } = await supabase
    .from("trips")
    .select("id, name, location, starts_on, created_at")
    .order("starts_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1);

  const trip = trips?.[0] ?? null;

  let rows: ReturnType<typeof computeLeaderboard> = [];

  if (trip) {
    const [membersRes, roundsRes] = await Promise.all([
      supabase
        .from("trip_members")
        .select("profile_id, handicap, profiles(id, display_name)")
        .eq("trip_id", trip.id),
      supabase.from("rounds").select("id, par").eq("trip_id", trip.id),
    ]);

    const memberData = (membersRes.data ?? []) as MemberRow[];
    const rounds = (roundsRes.data ?? []).map((r) => ({
      id: r.id as string,
      par: r.par as number | null,
    }));

    const members = memberData.map((m) => {
      const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
      return {
        id: m.profile_id,
        display_name: profile?.display_name ?? "Unknown player",
        handicap: m.handicap,
      };
    });

    let scores: { round_id: string; profile_id: string; total_strokes: number | null }[] = [];
    if (rounds.length > 0) {
      const { data: scoreData } = await supabase
        .from("scores")
        .select("round_id, profile_id, total_strokes")
        .in(
          "round_id",
          rounds.map((r) => r.id)
        );
      scores = (scoreData ?? []).map((s) => ({
        round_id: s.round_id as string,
        profile_id: s.profile_id as string,
        total_strokes: s.total_strokes as number | null,
      }));
    }

    rows = computeLeaderboard(members, rounds, scores);
  }

  return (
    <div className="space-y-20 pb-20">
      <Hero signedIn={Boolean(user)} />

      {trip && (
        <section className="px-6">
          <div className="mx-auto max-w-2xl space-y-6">
            <header className="text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                Live Net Standings
              </p>
              <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-foreground">
                {trip.name}
              </h2>
              {trip.location && (
                <p className="mt-1 inline-flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {trip.location}
                </p>
              )}
            </header>

            <Leaderboard rows={rows} live />

            {!user && <SignInBanner />}
          </div>
          <RealtimeRefresher />
        </section>
      )}

      <FeatureCards />
    </div>
  );
}
