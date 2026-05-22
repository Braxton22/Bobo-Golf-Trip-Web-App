import { notFound } from "next/navigation";
import {
  CalendarDays,
  DollarSign,
  ExternalLink,
  Flag,
  Home,
  Trophy,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { computeLeaderboard, type MemberInput } from "@/lib/scoring";
import { Leaderboard } from "@/components/leaderboard";
import { RealtimeRefresher } from "@/components/realtime-refresher";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TripHeader } from "@/components/trip-detail/trip-header";
import { SectionHeading } from "@/components/trip-detail/section-heading";
import {
  addAirbnb,
  addBet,
  addRound,
  cancelBet,
  joinTrip,
  saveScore,
  setHandicap,
  settleBet,
} from "../actions";

type Member = {
  id: string;
  display_name: string;
  handicap: number | null;
  role: string | null;
};

function formatDate(value: string | null) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const betStatusVariant: Record<string, "live" | "secondary" | "outline"> = {
  open: "live",
  settled: "secondary",
  cancelled: "outline",
};

export default async function TripDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tripId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: trip } = await supabase
    .from("trips")
    .select("id, name, location, starts_on, ends_on, created_by")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) notFound();

  const { data: members } = await supabase
    .from("trip_members")
    .select("profile_id, role, handicap, profiles(id, display_name)")
    .eq("trip_id", tripId);

  const roster: Member[] = (members ?? [])
    .map((m: any) => {
      if (!m.profiles) return null;
      return {
        id: m.profiles.id as string,
        display_name: m.profiles.display_name as string,
        handicap: (m.handicap ?? null) as number | null,
        role: (m.role ?? null) as string | null,
      };
    })
    .filter(Boolean) as Member[];

  const isMember = roster.some((p) => p.id === user?.id);

  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, course_name, played_on, par, notes")
    .eq("trip_id", tripId)
    .order("played_on", { ascending: true });

  const roundIds = (rounds ?? []).map((r) => r.id);
  const { data: scores } = roundIds.length
    ? await supabase
        .from("scores")
        .select("round_id, profile_id, total_strokes")
        .in("round_id", roundIds)
    : { data: [] as any[] };

  const { data: airbnbs } = await supabase
    .from("airbnbs")
    .select("*")
    .eq("trip_id", tripId)
    .order("check_in", { ascending: true });

  const { data: bets } = await supabase
    .from("bets")
    .select("id, description, amount, status, round_id, winner_id, proposed_by")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  if (!isMember) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center pt-12 text-center">
        <Card className="w-full animate-fade-in shadow-lift">
          <CardHeader className="items-center text-center">
            <span className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Trophy className="h-6 w-6" />
            </span>
            <CardTitle>{trip.name}</CardTitle>
            <CardDescription>
              You&apos;re not on this trip yet. Join to log rounds, post
              scores, and get in on the side bets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={joinTrip}>
              <input type="hidden" name="trip_id" value={trip.id} />
              <Button className="w-full" size="lg">
                Join trip
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const leaderboardMembers: MemberInput[] = roster.map((m) => ({
    id: m.id,
    display_name: m.display_name,
    handicap: m.handicap,
  }));
  const leaderboardRows = computeLeaderboard(
    leaderboardMembers,
    (rounds ?? []).map((r) => ({ id: r.id, par: r.par })),
    (scores ?? []) as any[]
  );

  const scoreFor = (roundId: string, profileId: string) =>
    (scores ?? []).find(
      (s: any) => s.round_id === roundId && s.profile_id === profileId
    )?.total_strokes ?? "";

  return (
    <div className="space-y-10">
      <RealtimeRefresher />

      <TripHeader
        name={trip.name}
        location={trip.location}
        startsOn={trip.starts_on}
        endsOn={trip.ends_on}
        playerCount={roster.length}
      />

      {/* Leaderboard */}
      <section className="space-y-4 animate-fade-in">
        <SectionHeading
          icon={Trophy}
          title="Leaderboard"
          description="Net scoring — gross strokes less per-trip handicap."
        />
        <Leaderboard
          rows={leaderboardRows}
          live
          emptyLabel="No scores posted yet — add a round and start posting."
        />
      </section>

      {/* Rounds */}
      <section className="space-y-4">
        <SectionHeading
          icon={Flag}
          title="Rounds"
          description="Log each round and post every player's strokes."
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a round</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={addRound}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
            >
              <input type="hidden" name="trip_id" value={trip.id} />
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="course_name">Course</Label>
                <Input
                  id="course_name"
                  name="course_name"
                  required
                  placeholder="Pinehurst No. 2"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="played_on">Date</Label>
                <Input id="played_on" name="played_on" type="date" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="par">Par</Label>
                <Input id="par" name="par" type="number" placeholder="72" />
              </div>
              <div className="flex items-end">
                <Button className="w-full">Add round</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {(rounds ?? []).map((r) => (
            <Card key={r.id} className="transition-shadow hover:shadow-lift">
              <CardHeader className="flex-row items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{r.course_name}</CardTitle>
                  <CardDescription className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDate(r.played_on) ?? r.played_on}
                  </CardDescription>
                </div>
                {r.par ? (
                  <Badge variant="outline">Par {r.par}</Badge>
                ) : null}
              </CardHeader>
              <CardContent>
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Post scores
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {roster.map((p) => (
                    <form
                      key={p.id}
                      action={saveScore}
                      className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/40 px-3 py-2"
                    >
                      <input type="hidden" name="round_id" value={r.id} />
                      <input type="hidden" name="profile_id" value={p.id} />
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <span className="w-28 shrink-0 truncate text-sm font-medium">
                        {p.display_name}
                      </span>
                      <Input
                        name="total_strokes"
                        type="number"
                        defaultValue={scoreFor(r.id, p.id)}
                        className="h-9 flex-1"
                        placeholder="Strokes"
                      />
                      <Button type="submit" variant="ghost" size="sm">
                        Save
                      </Button>
                    </form>
                  ))}
                </div>
                {r.notes ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {r.notes}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {(rounds ?? []).length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No rounds yet — add one above to get the boys on the board.
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Airbnbs */}
      <section className="space-y-4">
        <SectionHeading
          icon={Home}
          title="Stays"
          description="Where the crew is bunking down."
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a stay</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={addAirbnb}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6"
            >
              <input type="hidden" name="trip_id" value={trip.id} />
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  required
                  placeholder="The Pine House"
                />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" name="address" />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="url">Listing URL</Label>
                <Input
                  id="url"
                  name="url"
                  type="url"
                  placeholder="https://airbnb.com/…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="check_in">Check in</Label>
                <Input id="check_in" name="check_in" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="check_out">Check out</Label>
                <Input id="check_out" name="check_out" type="date" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="total_cost">Total cost</Label>
                <Input
                  id="total_cost"
                  name="total_cost"
                  type="number"
                  step="0.01"
                />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="airbnb_notes">Notes</Label>
                <Input id="airbnb_notes" name="notes" />
              </div>
              <div className="flex items-end">
                <Button className="w-full">Add stay</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          {(airbnbs ?? []).map((a: any) => (
            <Card key={a.id} className="transition-shadow hover:shadow-lift">
              <CardHeader>
                <CardTitle className="text-lg">{a.name}</CardTitle>
                {a.address ? (
                  <CardDescription>{a.address}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDate(a.check_in) ?? "?"} →{" "}
                  {formatDate(a.check_out) ?? "?"}
                </p>
                {a.total_cost ? (
                  <Badge variant="secondary">
                    ${Number(a.total_cost).toFixed(2)} total
                  </Badge>
                ) : null}
                {a.notes ? (
                  <p className="text-sm text-foreground">{a.notes}</p>
                ) : null}
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Open listing
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
              </CardContent>
            </Card>
          ))}
          {(airbnbs ?? []).length === 0 && (
            <Card className="sm:col-span-2">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No stays added yet.
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Side Bets */}
      <section className="space-y-4">
        <SectionHeading
          icon={DollarSign}
          title="Side Bets"
          description="Propose a wager, settle up after the round."
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Propose a bet</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={addBet}
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6"
            >
              <input type="hidden" name="trip_id" value={trip.id} />
              <div className="space-y-1.5 lg:col-span-3">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  name="description"
                  required
                  placeholder="Closest to pin, hole 7"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amount">Amount ($)</Label>
                <Input id="amount" name="amount" type="number" step="0.01" />
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label htmlFor="bet_round_id">Round (optional)</Label>
                <select
                  id="bet_round_id"
                  name="round_id"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">—</option>
                  {(rounds ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.course_name} · {formatDate(r.played_on) ?? r.played_on}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end lg:col-span-6">
                <Button>Propose bet</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {(bets ?? []).map((b) => {
            const winner = roster.find((p) => p.id === b.winner_id);
            const status = (b.status ?? "open") as string;
            return (
              <Card key={b.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{b.description}</p>
                      <Badge variant={betStatusVariant[status] ?? "outline"}>
                        {status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      ${Number(b.amount).toFixed(2)}
                      {winner ? ` · winner: ${winner.display_name}` : ""}
                    </p>
                  </div>
                  {status === "open" && (
                    <div className="flex flex-wrap items-end gap-2">
                      <form
                        action={settleBet}
                        className="flex items-end gap-2"
                      >
                        <input type="hidden" name="bet_id" value={b.id} />
                        <input type="hidden" name="trip_id" value={trip.id} />
                        <select
                          name="winner_id"
                          required
                          className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="">Pick winner</option>
                          {roster.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.display_name}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" size="sm">
                          Settle
                        </Button>
                      </form>
                      <form action={cancelBet}>
                        <input type="hidden" name="bet_id" value={b.id} />
                        <input type="hidden" name="trip_id" value={trip.id} />
                        <Button type="submit" variant="ghost" size="sm">
                          Cancel
                        </Button>
                      </form>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {(bets ?? []).length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No bets yet — get gambling.
              </CardContent>
            </Card>
          )}
        </div>
      </section>

      {/* Players roster */}
      <section className="space-y-4">
        <SectionHeading
          icon={Users}
          title="Players"
          description="Set each player's per-trip handicap for net scoring."
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roster.map((p) => (
            <Card key={p.id} className="transition-shadow hover:shadow-lift">
              <CardContent className="space-y-3 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{p.display_name}</p>
                  {p.role ? (
                    <Badge variant="outline">{p.role}</Badge>
                  ) : null}
                </div>
                <form
                  action={setHandicap}
                  className="flex items-end gap-2"
                >
                  <input type="hidden" name="trip_id" value={trip.id} />
                  <input type="hidden" name="profile_id" value={p.id} />
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor={`handicap-${p.id}`}>Handicap</Label>
                    <Input
                      id={`handicap-${p.id}`}
                      name="handicap"
                      type="number"
                      step="0.1"
                      defaultValue={p.handicap ?? ""}
                      className="h-9"
                      placeholder="0"
                    />
                  </div>
                  <Button type="submit" variant="outline" size="sm">
                    Save
                  </Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-2 py-4 text-xs text-muted-foreground">
            <p>
              Trip ID: <code className="text-foreground">{trip.id}</code> —
              share this with the boys so they can sign in and join.
            </p>
            <p>
              Join link:{" "}
              <code className="break-all text-foreground">
                {process.env.NEXT_PUBLIC_SITE_URL ?? ""}/trips/{trip.id}
              </code>
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
