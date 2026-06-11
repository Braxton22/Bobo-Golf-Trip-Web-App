"use client";

// Score entry for casual-format rounds.
//   - Solo formats (medal / stableford / skins / count_birdies): every player
//     posts their own ball; scores carry match_id = null.
//   - Group scramble: each group (a match row with empty side_b) posts ONE
//     ball as team_side 'A'.
// Uses the same offline queue as the match scorecard.

import { useEffect, useMemo, useState } from "react";
import { Cloud, Wifi, WifiOff } from "lucide-react";
import { useScoreQueue, type ScoreWrite } from "@/lib/score-queue";
import { upsertScore } from "../../actions";
import {
  allocateStrokes,
  birdiePointsForHole,
  courseHandicap,
  formatToPar,
  stablefordPoints,
  toParTone,
} from "@/lib/scoring";
import { HoleRow, indicatorFor, type EntryHole, type SyncIndicator } from "@/components/score/hole-entry";
import type { RoundFormat } from "@/lib/db";

type EntryPlayer = { id: string; name: string; handicap_index: number };
type Group = { id: string; number: number; memberIds: string[]; label: string };

type Props = {
  round: { id: string; format: RoundFormat };
  holes: EntryHole[];
  /** Players whose card renders with steppers (you; everyone if admin). */
  writablePlayers: EntryPlayer[];
  /** Groups for group_scramble rounds; empty otherwise. */
  groups: Group[];
  writableGroupIds: string[];
  initialScores: {
    hole_number: number;
    player_id: string | null;
    match_id: string | null;
    gross: number;
  }[];
};

export function SoloEntry({ round, holes, writablePlayers, groups, writableGroupIds, initialScores }: Props) {
  const [scores, setScores] = useState(() => {
    const m = new Map<string, number>();
    for (const s of initialScores) {
      const who = s.player_id ?? `group:${s.match_id}`;
      m.set(`${who}|${s.hole_number}`, s.gross);
    }
    return m;
  });

  const [online, setOnline] = useState<boolean>(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const { queue, enqueue, pending } = useScoreQueue(async (w: ScoreWrite) => {
    await upsertScore(w);
  });

  const queueByLocalKey = useMemo(() => {
    const m = new Map<string, (typeof queue)[number]>();
    for (const q of queue) {
      if (q.round_id !== round.id) continue;
      const who = q.player_id ?? `group:${q.match_id}`;
      m.set(`${who}|${q.hole_number}`, q);
    }
    return m;
  }, [queue, round.id]);
  const statusFor = (localKey: string): SyncIndicator => indicatorFor(queueByLocalKey.get(localKey));

  function writePlayerHole(player_id: string, hole_number: number, gross: number | null) {
    const localKey = `${player_id}|${hole_number}`;
    setScores((prev) => {
      const next = new Map(prev);
      if (gross == null) next.delete(localKey);
      else next.set(localKey, gross);
      return next;
    });
    if (gross == null) return;
    enqueue({ round_id: round.id, match_id: null, player_id, team_side: null, hole_number, gross });
  }

  function writeGroupHole(group_id: string, hole_number: number, gross: number | null) {
    const localKey = `group:${group_id}|${hole_number}`;
    setScores((prev) => {
      const next = new Map(prev);
      if (gross == null) next.delete(localKey);
      else next.set(localKey, gross);
      return next;
    });
    if (gross == null) return;
    enqueue({ round_id: round.id, match_id: group_id, player_id: null, team_side: "A", hole_number, gross });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-line bg-card/60 px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5">
          {online ? (
            <Wifi className="h-3.5 w-3.5 text-green-soft" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {online ? "Online" : "Offline — scores will sync when reconnected"}
        </span>
        {pending > 0 && (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Cloud className="h-3.5 w-3.5" /> {pending} pending
          </span>
        )}
      </div>

      {round.format === "group_scramble" ? (
        <section className="space-y-3">
          <h2 className="label">Group score — one gross per hole</h2>
          {groups.map((g) => {
            const canWrite = writableGroupIds.includes(g.id);
            const summary = groupSummary(g.id, holes, scores);
            return (
              <article key={g.id} className="card space-y-2">
                <header className="flex items-center justify-between gap-2">
                  <h3 className="font-medium">
                    Group {g.number}{" "}
                    <span className="text-xs text-muted-foreground">· {g.label}</span>
                  </h3>
                  <SummaryChip toPar={summary.toPar} thru={summary.thru} />
                </header>
                {!canWrite && (
                  <p className="text-[11px] text-muted-foreground">Read-only — not your group.</p>
                )}
                <ul className="divide-y divide-line">
                  {holes.map((h) => {
                    const k = `group:${g.id}|${h.hole_number}`;
                    return (
                      <HoleRow
                        key={k}
                        hole={h}
                        value={scores.get(k) ?? null}
                        status={canWrite ? statusFor(k) : "saved"}
                        readOnly={!canWrite}
                        onChange={
                          canWrite
                            ? (gross) => writeGroupHole(g.id, h.hole_number, gross)
                            : () => undefined
                        }
                      />
                    );
                  })}
                </ul>
              </article>
            );
          })}
          {groups.length === 0 && (
            <p className="card text-sm text-muted-foreground">
              No groups set up yet — ask the admin to add them under Rounds.
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="label">Enter your gross per hole</h2>
          {writablePlayers.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              format={round.format}
              holes={holes}
              scores={scores}
              statusFor={statusFor}
              onWrite={(hole, gross) => writePlayerHole(p.id, hole, gross)}
            />
          ))}
          {writablePlayers.length === 0 && (
            <p className="card text-sm text-muted-foreground">
              You're not on this trip's roster — ask the admin to add you.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlayerCard({
  player,
  format,
  holes,
  scores,
  statusFor,
  onWrite,
}: {
  player: EntryPlayer;
  format: RoundFormat;
  holes: EntryHole[];
  scores: Map<string, number>;
  statusFor: (k: string) => SyncIndicator;
  onWrite: (hole_number: number, gross: number | null) => void;
}) {
  const ch = courseHandicap({ index: player.handicap_index }, { holes }, "simple");
  const strokeMap = allocateStrokes(ch, holes);
  const useNet = format === "stableford" || format === "skins" || format === "medal";

  // Running summary for this player's card.
  let gross = 0;
  let net = 0;
  let parPlayed = 0;
  let points = 0;
  let thru = 0;
  for (const h of holes) {
    const v = scores.get(`${player.id}|${h.hole_number}`);
    if (v == null) continue;
    thru += 1;
    gross += v;
    const received = strokeMap.get(h.hole_number) ?? 0;
    net += v - received;
    parPlayed += h.par;
    if (format === "stableford") points += stablefordPoints(v - received - h.par);
    if (format === "count_birdies") points += birdiePointsForHole(v - h.par);
  }

  const headline =
    format === "stableford"
      ? `${points} pts`
      : format === "count_birdies"
        ? `${points} pts`
        : formatToPar(thru > 0 ? (useNet ? net : gross) - parPlayed : null);

  return (
    <article className="card space-y-2">
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-medium">
          {player.name}{" "}
          <span className="text-xs text-muted-foreground">idx {player.handicap_index.toFixed(1)}</span>
        </h3>
        <div className="text-right">
          <p className="font-serif text-2xl font-semibold tabular-nums">{headline}</p>
          <p className="text-[11px] text-muted-foreground">thru {thru}</p>
        </div>
      </header>
      <ul className="divide-y divide-line">
        {holes.map((h) => {
          const k = `${player.id}|${h.hole_number}`;
          const v = scores.get(k) ?? null;
          const received = strokeMap.get(h.hole_number) ?? 0;
          let badge: string | null = null;
          if (v != null && format === "stableford") {
            badge = `${stablefordPoints(v - received - h.par)} pts`;
          }
          if (v != null && format === "count_birdies") {
            const pts = birdiePointsForHole(v - h.par);
            badge = pts > 0 ? `+${pts} pts` : null;
          }
          return (
            <HoleRow
              key={k}
              hole={h}
              value={v}
              strokesReceived={format === "count_birdies" ? 0 : received}
              status={statusFor(k)}
              badge={badge}
              onChange={(gross) => onWrite(h.hole_number, gross)}
            />
          );
        })}
      </ul>
    </article>
  );
}

function groupSummary(groupId: string, holes: EntryHole[], scores: Map<string, number>) {
  let gross = 0;
  let parPlayed = 0;
  let thru = 0;
  for (const h of holes) {
    const v = scores.get(`group:${groupId}|${h.hole_number}`);
    if (v == null) continue;
    gross += v;
    parPlayed += h.par;
    thru += 1;
  }
  return { toPar: thru > 0 ? gross - parPlayed : null, thru };
}

function SummaryChip({ toPar, thru }: { toPar: number | null; thru: number }) {
  const tone = toParTone(toPar);
  const color =
    tone === "under"
      ? "text-[hsl(var(--score-under))]"
      : tone === "over"
        ? "text-foreground"
        : "text-muted-foreground";
  return (
    <span className="text-right">
      <span className={`font-serif text-xl font-semibold tabular-nums ${color}`}>{formatToPar(toPar)}</span>
      <span className="ml-1.5 text-[11px] text-muted-foreground">thru {thru}</span>
    </span>
  );
}
