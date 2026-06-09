import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import type { Player, Round } from "@/lib/db";
import { Field, FormRow, SubmitButton } from "@/components/admin/section";
import { createBetAction } from "../actions";

const TYPES: { value: string; label: string }[] = [
  { value: "match", label: "Match bet" },
  { value: "skins", label: "Skins" },
  { value: "longest_drive", label: "Longest drive" },
  { value: "closest_to_pin", label: "Closest to pin" },
  { value: "hole_score", label: "Low score on a hole" },
  { value: "low_net_round", label: "Low net round of the day" },
  { value: "other", label: "Other" },
];

export default async function NewBetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/bets/new");

  const trip = await getActiveTrip();
  if (!trip) redirect("/bets");

  const [{ data: playersRaw }, { data: roundsRaw }] = await Promise.all([
    supabase.from("players").select("*").eq("trip_id", trip.id).order("name"),
    supabase.from("rounds").select("*").eq("trip_id", trip.id).order("day_number"),
  ]);
  const players = (playersRaw ?? []) as Player[];
  const rounds = (roundsRaw ?? []) as Round[];

  return (
    <div className="space-y-4">
      <Link href="/bets" className="-ml-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" />
        Bets
      </Link>
      <header>
        <h1 className="font-serif text-2xl font-semibold">New bet</h1>
        <p className="text-sm text-muted-foreground">No money is actually moved — Venmo deep links only.</p>
      </header>

      <form action={createBetAction} className="card space-y-3">
        <FormRow>
          <Field label="Type">
            <select className="input" name="type" defaultValue="match">
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Amount ($)">
            <input
              className="input"
              name="amount"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              defaultValue="20"
              required
            />
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Round (optional)">
            <select className="input" name="round_id" defaultValue="">
              <option value="">— any —</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  Day {r.day_number} · {r.format.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Hole #">
            <input
              className="input"
              name="hole_number"
              type="number"
              min="1"
              max="18"
              inputMode="numeric"
              placeholder="—"
            />
          </Field>
        </FormRow>
        <Field label="Description">
          <input
            className="input"
            name="description"
            placeholder="Closest to pin on 11"
            required
          />
        </Field>

        <Field label="Participants" hint="Tap everyone who's in. Pick the winner(s) when you settle.">
          <ul className="grid grid-cols-2 gap-2">
            {players.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 rounded-xl border border-line bg-background/40 p-2.5">
                  <input
                    type="checkbox"
                    name="participant_ids"
                    value={p.id}
                    className="h-5 w-5 rounded border-line text-primary focus:ring-primary"
                  />
                  <span className="text-sm">{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </Field>

        <SubmitButton>Create bet</SubmitButton>
      </form>
    </div>
  );
}
