import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  addAirbnb,
  addBet,
  addRound,
  cancelBet,
  joinTrip,
  saveScore,
  settleBet,
} from "../actions";

type Profile = { id: string; display_name: string };

export default async function TripDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tripId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: trip } = await supabase
    .from("trips")
    .select("id, name, location, starts_on, ends_on, created_by")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) notFound();

  const { data: members } = await supabase
    .from("trip_members")
    .select("profile_id, role, profiles(id, display_name)")
    .eq("trip_id", tripId);

  const memberProfiles: Profile[] = (members ?? [])
    .map((m: any) => m.profiles)
    .filter(Boolean);

  const isMember = memberProfiles.some((p) => p.id === user?.id);

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
      <div className="card max-w-md mx-auto">
        <h1 className="text-xl font-bold text-fairway-700">{trip.name}</h1>
        <p className="mt-2 text-sm text-fairway-900/70">
          You're not on this trip yet. Join to log rounds and bets.
        </p>
        <form action={joinTrip} className="mt-3">
          <input type="hidden" name="trip_id" value={trip.id} />
          <button className="btn">Join trip</button>
        </form>
      </div>
    );
  }

  const scoreFor = (roundId: string, profileId: string) =>
    (scores ?? []).find((s: any) => s.round_id === roundId && s.profile_id === profileId)
      ?.total_strokes ?? "";

  const leaderboard = memberProfiles
    .map((p) => {
      const totals = (scores ?? [])
        .filter((s: any) => s.profile_id === p.id)
        .reduce((a: number, s: any) => a + (s.total_strokes ?? 0), 0);
      const played = (scores ?? []).filter((s: any) => s.profile_id === p.id).length;
      return { ...p, totals, played };
    })
    .sort((a, b) => (a.totals || 9999) - (b.totals || 9999));

  return (
    <div className="space-y-8">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fairway-700">{trip.name}</h1>
          <p className="text-sm text-fairway-900/70">
            {trip.location ?? "Location TBD"} · {trip.starts_on ?? "?"} → {trip.ends_on ?? "?"}
          </p>
        </div>
        <div className="text-xs text-fairway-900/60">
          {memberProfiles.length} player{memberProfiles.length === 1 ? "" : "s"}
        </div>
      </header>

      {/* Leaderboard */}
      <section className="card">
        <h2 className="font-semibold text-fairway-700">🏆 Leaderboard</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs uppercase text-fairway-900/60">
            <tr>
              <th className="py-1">Player</th>
              <th>Rounds</th>
              <th>Total strokes</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((p) => (
              <tr key={p.id} className="border-t border-fairway-100">
                <td className="py-1">{p.display_name}</td>
                <td>{p.played}</td>
                <td>{p.totals || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Rounds */}
      <section className="card">
        <h2 className="font-semibold text-fairway-700">⛳ Rounds</h2>
        <form action={addRound} className="mt-3 grid gap-3 md:grid-cols-5">
          <input type="hidden" name="trip_id" value={trip.id} />
          <div className="md:col-span-2">
            <label className="label">Course</label>
            <input name="course_name" required className="input" placeholder="Pinehurst No. 2" />
          </div>
          <div>
            <label className="label">Date</label>
            <input name="played_on" type="date" required className="input" />
          </div>
          <div>
            <label className="label">Par</label>
            <input name="par" type="number" className="input" placeholder="72" />
          </div>
          <div className="flex items-end">
            <button className="btn w-full">Add round</button>
          </div>
        </form>

        <div className="mt-5 space-y-5">
          {(rounds ?? []).map((r) => (
            <div key={r.id} className="rounded-lg border border-fairway-100 p-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <h3 className="font-semibold">{r.course_name}</h3>
                  <p className="text-xs text-fairway-900/60">
                    {r.played_on}
                    {r.par ? ` · par ${r.par}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {memberProfiles.map((p) => (
                  <form
                    key={p.id}
                    action={saveScore}
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="round_id" value={r.id} />
                    <input type="hidden" name="profile_id" value={p.id} />
                    <input type="hidden" name="trip_id" value={trip.id} />
                    <span className="w-32 truncate text-sm">{p.display_name}</span>
                    <input
                      name="total_strokes"
                      type="number"
                      defaultValue={scoreFor(r.id, p.id)}
                      className="input flex-1"
                      placeholder="strokes"
                    />
                    <button className="btn-ghost">Save</button>
                  </form>
                ))}
              </div>
            </div>
          ))}
          {(rounds ?? []).length === 0 && (
            <p className="text-sm text-fairway-900/70">No rounds yet — add one above.</p>
          )}
        </div>
      </section>

      {/* Airbnbs */}
      <section className="card">
        <h2 className="font-semibold text-fairway-700">🏠 Airbnbs</h2>
        <form action={addAirbnb} className="mt-3 grid gap-3 md:grid-cols-6">
          <input type="hidden" name="trip_id" value={trip.id} />
          <div className="md:col-span-2">
            <label className="label">Name</label>
            <input name="name" required className="input" placeholder="The Pine House" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Address</label>
            <input name="address" className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Listing URL</label>
            <input name="url" type="url" className="input" placeholder="https://airbnb.com/…" />
          </div>
          <div>
            <label className="label">Check in</label>
            <input name="check_in" type="date" className="input" />
          </div>
          <div>
            <label className="label">Check out</label>
            <input name="check_out" type="date" className="input" />
          </div>
          <div>
            <label className="label">Total cost</label>
            <input name="total_cost" type="number" step="0.01" className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Notes</label>
            <input name="notes" className="input" />
          </div>
          <div className="flex items-end">
            <button className="btn w-full">Add stay</button>
          </div>
        </form>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(airbnbs ?? []).map((a: any) => (
            <div key={a.id} className="rounded-lg border border-fairway-100 p-4">
              <h3 className="font-semibold">{a.name}</h3>
              <p className="text-xs text-fairway-900/70">{a.address}</p>
              <p className="text-xs text-fairway-900/60 mt-1">
                {a.check_in ?? "?"} → {a.check_out ?? "?"}
                {a.total_cost ? ` · $${a.total_cost}` : ""}
              </p>
              {a.url && (
                <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-fairway-700 underline">
                  Open listing
                </a>
              )}
              {a.notes && <p className="text-sm mt-2">{a.notes}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* Bets */}
      <section className="card">
        <h2 className="font-semibold text-fairway-700">💸 Side Bets</h2>
        <form action={addBet} className="mt-3 grid gap-3 md:grid-cols-6">
          <input type="hidden" name="trip_id" value={trip.id} />
          <div className="md:col-span-3">
            <label className="label">Description</label>
            <input name="description" required className="input" placeholder="Closest to pin, hole 7" />
          </div>
          <div>
            <label className="label">Amount ($)</label>
            <input name="amount" type="number" step="0.01" className="input" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Round (optional)</label>
            <select name="round_id" className="input">
              <option value="">—</option>
              {(rounds ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.course_name} · {r.played_on}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-6">
            <button className="btn">Propose bet</button>
          </div>
        </form>

        <div className="mt-4 space-y-2">
          {(bets ?? []).map((b) => {
            const winner = memberProfiles.find((p) => p.id === b.winner_id);
            return (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-fairway-100 p-3"
              >
                <div>
                  <p className="font-medium">{b.description}</p>
                  <p className="text-xs text-fairway-900/60">
                    ${Number(b.amount).toFixed(2)} · {b.status}
                    {winner ? ` · winner: ${winner.display_name}` : ""}
                  </p>
                </div>
                {b.status === "open" && (
                  <div className="flex items-center gap-2">
                    <form action={settleBet} className="flex items-center gap-2">
                      <input type="hidden" name="bet_id" value={b.id} />
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <select name="winner_id" required className="input">
                        <option value="">Pick winner</option>
                        {memberProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.display_name}
                          </option>
                        ))}
                      </select>
                      <button className="btn">Settle</button>
                    </form>
                    <form action={cancelBet}>
                      <input type="hidden" name="bet_id" value={b.id} />
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <button className="btn-ghost">Cancel</button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
          {(bets ?? []).length === 0 && (
            <p className="text-sm text-fairway-900/70">No bets yet — get gambling.</p>
          )}
        </div>
      </section>

      {/* Roster */}
      <section className="card">
        <h2 className="font-semibold text-fairway-700">👥 Players</h2>
        <ul className="mt-3 grid gap-1 md:grid-cols-3 text-sm">
          {memberProfiles.map((p) => (
            <li key={p.id} className="rounded border border-fairway-100 px-3 py-2">
              {p.display_name}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-fairway-900/60">
          Trip ID: <code>{trip.id}</code> — share this with the boys, they sign in and the
          organizer adds them in the SQL editor (or share the join link below for self-serve).
        </p>
        <p className="mt-1 text-xs text-fairway-900/60">
          Join link:{" "}
          <code className="break-all">
            {process.env.NEXT_PUBLIC_SITE_URL ?? ""}/trips/{trip.id}
          </code>
        </p>
      </section>
    </div>
  );
}
