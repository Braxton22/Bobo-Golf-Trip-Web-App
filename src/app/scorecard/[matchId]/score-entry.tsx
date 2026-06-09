"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, Cloud, CloudOff, Check, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { useScoreQueue, type ScoreWrite } from "@/lib/score-queue";
import { upsertScore } from "../actions";
import {
  allocateStrokes,
  bestBallBonusPerHole,
  courseHandicap,
  formatToPar,
  singlesPerHoleNet,
  toParTone,
} from "@/lib/scoring";
import type { HoleScore } from "@/lib/scoring/types";

type Hole = { hole_number: number; par: number; stroke_index: number };
type SidePlayer = { id: string; name: string; handicap_index: number; user_id: string | null };

type Props = {
  round: { id: string; format: "scramble" | "best_ball_bonus" | "singles" };
  match: {
    id: string;
    side_a: string[];
    side_b: string[];
    team_a_name: string;
    team_b_name: string;
  };
  mySide: "A" | "B" | null;
  isAdmin: boolean;
  players: SidePlayer[];
  holes: Hole[];
  initialScores: { hole_number: number; player_id: string | null; team_side: "A" | "B" | null; gross: number }[];
};

type SyncIndicator = "saved" | "queued" | "syncing" | "error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indicatorFor(item: { status: string } | undefined): SyncIndicator {
  if (!item) return "saved";
  if (item.status === "queued") return "queued";
  if (item.status === "syncing") return "syncing";
  if (item.status === "error") return "error";
  return "saved";
}

function Stepper({
  value,
  onChange,
  ariaLabel,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  ariaLabel: string;
}) {
  const set = (n: number | null) => {
    if (n != null) {
      if (n < 1) n = 1;
      if (n > 15) n = 15;
    }
    onChange(n);
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        className="tap rounded-full border border-line bg-background text-foreground active:bg-muted"
        onClick={() => set(value == null ? 4 : value - 1)}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        aria-label={ariaLabel}
        inputMode="numeric"
        pattern="[0-9]*"
        className="h-11 w-12 rounded-xl border border-input bg-background text-center text-lg font-semibold tabular-nums"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value.trim();
          if (v === "") return set(null);
          const n = Number(v);
          if (!Number.isFinite(n)) return;
          set(Math.floor(n));
        }}
      />
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        className="tap rounded-full border border-line bg-background text-foreground active:bg-muted"
        onClick={() => set(value == null ? 4 : value + 1)}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

function SyncDot({ status }: { status: SyncIndicator }) {
  const Icon = status === "saved" ? Check : status === "syncing" ? Cloud : status === "error" ? AlertTriangle : CloudOff;
  const cls =
    status === "saved"
      ? "text-green-soft"
      : status === "syncing"
        ? "text-primary"
        : status === "error"
          ? "text-destructive"
          : "text-muted-foreground";
  const label =
    status === "saved"
      ? "Saved"
      : status === "syncing"
        ? "Syncing…"
        : status === "error"
          ? "Will retry"
          : "Will sync";
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] ${cls}`}>
      <Icon className="h-3 w-3" aria-hidden /> {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ScoreEntry({ round, match, mySide, isAdmin, players, holes, initialScores }: Props) {
  // Local optimistic score state keyed by `${who}|${hole_number}` so we can
  // render instantly and reconcile against the queue later.
  const [scores, setScores] = useState(() => {
    const m = new Map<string, number>();
    for (const s of initialScores) {
      const who = s.player_id ?? `team:${s.team_side}`;
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

  // Map from local UI key (`who|hole`) → queue item. The queue's own key is
  // `round|match|who|hole`, but we only ever look at items for this match.
  const queueByLocalKey = useMemo(() => {
    const m = new Map<string, (typeof queue)[number]>();
    for (const q of queue) {
      if (q.match_id !== match.id) continue;
      const who = q.player_id ?? `team:${q.team_side}`;
      m.set(`${who}|${q.hole_number}`, q);
    }
    return m;
  }, [queue, match.id]);
  const statusFor = (localKey: string): SyncIndicator => indicatorFor(queueByLocalKey.get(localKey));

  // Helper to write a hole — also updates local optimistic state.
  function writeHole({
    player_id,
    team_side,
    hole_number,
    gross,
  }: {
    player_id: string | null;
    team_side: "A" | "B" | null;
    hole_number: number;
    gross: number | null;
  }) {
    const who = player_id ?? `team:${team_side}`;
    const localKey = `${who}|${hole_number}`;
    setScores((prev) => {
      const next = new Map(prev);
      if (gross == null) next.delete(localKey);
      else next.set(localKey, gross);
      return next;
    });
    if (gross == null) return; // deletion path could be added later
    enqueue({
      round_id: round.id,
      match_id: match.id,
      player_id,
      team_side,
      hole_number,
      gross,
    });
  }

  const sideAPlayers = players.filter((p) => match.side_a.includes(p.id));
  const sideBPlayers = players.filter((p) => match.side_b.includes(p.id));

  return (
    <div className="space-y-4">
      {/* Connection / queue status banner */}
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

      {/* Match summary row */}
      <SummaryRow
        round={round.format}
        match={match}
        players={players}
        holes={holes}
        scores={scores}
      />

      {round.format === "scramble" ? (
        <ScrambleEntry
          holes={holes}
          match={match}
          mySide={mySide}
          isAdmin={isAdmin}
          scores={scores}
          statusFor={statusFor}
          writeHole={writeHole}
        />
      ) : round.format === "singles" ? (
        <SinglesEntry
          holes={holes}
          sideAPlayers={sideAPlayers}
          sideBPlayers={sideBPlayers}
          scores={scores}
          statusFor={statusFor}
          writeHole={writeHole}
        />
      ) : (
        <BestBallEntry
          holes={holes}
          sideAPlayers={sideAPlayers}
          sideBPlayers={sideBPlayers}
          scores={scores}
          statusFor={statusFor}
          writeHole={writeHole}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary header — shows running team scoreboard derived from the scores map.
// ---------------------------------------------------------------------------

function SummaryRow({
  round,
  match,
  players,
  holes,
  scores,
}: {
  round: Props["round"]["format"];
  match: Props["match"];
  players: SidePlayer[];
  holes: Hole[];
  scores: Map<string, number>;
}) {
  // Build team-per-hole scores for the summary based on the format.
  const sideAPlayers = players.filter((p) => match.side_a.includes(p.id));
  const sideBPlayers = players.filter((p) => match.side_b.includes(p.id));

  const aTeamHole = teamHoles(round, "A", sideAPlayers, holes, scores, match);
  const bTeamHole = teamHoles(round, "B", sideBPlayers, holes, scores, match);

  const aPar = aTeamHole.toPar;
  const bPar = bTeamHole.toPar;

  return (
    <div className="card grid grid-cols-2 gap-3">
      <TeamScoreCard name={match.team_a_name} toPar={aPar} thru={aTeamHole.thru} gross={aTeamHole.gross} />
      <TeamScoreCard name={match.team_b_name} toPar={bPar} thru={bTeamHole.thru} gross={bTeamHole.gross} />
    </div>
  );
}

function TeamScoreCard({
  name,
  toPar,
  thru,
  gross,
}: {
  name: string;
  toPar: number | null;
  thru: number;
  gross: number | null;
}) {
  const tone = toParTone(toPar);
  const color =
    tone === "under" ? "text-[hsl(var(--score-under))]" : tone === "over" ? "text-foreground" : "text-muted-foreground";
  return (
    <div className="text-center">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{name}</p>
      <p className={`mt-1 font-serif text-4xl font-semibold tabular-nums ${color}`}>{formatToPar(toPar)}</p>
      <p className="text-xs text-muted-foreground">
        {gross != null ? `${gross}` : "—"} · thru {thru}
      </p>
    </div>
  );
}

function teamHoles(
  format: Props["round"]["format"],
  side: "A" | "B",
  sidePlayers: SidePlayer[],
  holes: Hole[],
  scores: Map<string, number>,
  match: Props["match"]
): { perHole: Map<number, number>; gross: number | null; thru: number; toPar: number | null } {
  const course = { holes };
  if (format === "scramble") {
    // Team enters one gross per hole (no handicap reduction applied here — diff strokes is at the match level).
    const perHole = new Map<number, number>();
    let gross = 0;
    let thru = 0;
    for (const h of holes) {
      const k = `team:${side}|${h.hole_number}`;
      const v = scores.get(k);
      if (v != null) {
        perHole.set(h.hole_number, v);
        gross += v;
        thru += 1;
      }
    }
    if (thru === 0) return { perHole, gross: null, thru: 0, toPar: null };
    const parPlayed = [...perHole.keys()].reduce((acc, hn) => acc + (holes.find((h) => h.hole_number === hn)?.par ?? 4), 0);
    return { perHole, gross, thru, toPar: gross - parPlayed };
  }

  if (format === "singles") {
    // 1v1: sum the single player's net per hole.
    const p = sidePlayers[0];
    if (!p) return { perHole: new Map(), gross: null, thru: 0, toPar: null };
    const grosses: HoleScore[] = [];
    let grossTotal = 0;
    for (const h of holes) {
      const v = scores.get(`${p.id}|${h.hole_number}`);
      if (v != null) {
        grosses.push({ hole_number: h.hole_number, gross: v });
        grossTotal += v;
      }
    }
    if (grosses.length === 0) return { perHole: new Map(), gross: null, thru: 0, toPar: null };
    const perHole = singlesPerHoleNet(p.handicap_index, grosses, course);
    const parPlayed = grosses.reduce((acc, s) => acc + (holes.find((h) => h.hole_number === s.hole_number)?.par ?? 4), 0);
    // Render the to-par from NET for match-play coherence.
    let netSum = 0;
    perHole.forEach((v) => (netSum += v));
    return { perHole, gross: grossTotal, thru: grosses.length, toPar: netSum - parPlayed };
  }

  // best_ball_bonus
  const [pa, pb] = sidePlayers;
  if (!pa || !pb) return { perHole: new Map(), gross: null, thru: 0, toPar: null };
  const scoresByPlayer: Record<string, HoleScore[]> = { [pa.id]: [], [pb.id]: [] };
  let grossTotal = 0;
  for (const h of holes) {
    const va = scores.get(`${pa.id}|${h.hole_number}`);
    const vb = scores.get(`${pb.id}|${h.hole_number}`);
    if (va != null) {
      scoresByPlayer[pa.id].push({ hole_number: h.hole_number, gross: va });
      grossTotal += va;
    }
    if (vb != null) {
      scoresByPlayer[pb.id].push({ hole_number: h.hole_number, gross: vb });
      grossTotal += vb;
    }
  }
  const perHole = bestBallBonusPerHole(
    {
      pair: { a: { player_id: pa.id, index: pa.handicap_index }, b: { player_id: pb.id, index: pb.handicap_index } },
      scoresByPlayer,
    },
    course
  );
  if (perHole.size === 0) return { perHole: new Map(), gross: null, thru: 0, toPar: null };
  let netSum = 0;
  perHole.forEach((v) => (netSum += v));
  const parPlayed = [...perHole.keys()].reduce((acc, hn) => acc + (holes.find((h) => h.hole_number === hn)?.par ?? 4), 0);
  return { perHole, gross: grossTotal, thru: perHole.size, toPar: netSum - parPlayed };
  // NOTE: thru on best-ball counts holes where the TEAM has a usable score (at
  // least one partner posted).
}

// ---------------------------------------------------------------------------
// Per-format input layouts
// ---------------------------------------------------------------------------

function ScrambleEntry({
  holes,
  match,
  mySide,
  isAdmin,
  scores,
  statusFor,
  writeHole,
}: {
  holes: Hole[];
  match: Props["match"];
  mySide: "A" | "B" | null;
  isAdmin: boolean;
  scores: Map<string, number>;
  statusFor: (k: string) => SyncIndicator;
  writeHole: WriteHole;
}) {
  // Writable sides:
  //   - on a side → only your side
  //   - admin (no side) → both
  //   - bystander → neither (read-only view of both)
  // The opposing side renders as read-only so partners can watch live opponent
  // scores without being able to post for them. RLS rejects mismatched writes
  // even if the UI is bypassed.
  const writableSides = new Set<"A" | "B">(
    mySide ? [mySide] : isAdmin ? ["A", "B"] : []
  );

  return (
    <section className="space-y-3">
      <h2 className="label">Team scores per hole</h2>
      {(["A", "B"] as const).map((side) => {
        const canWrite = writableSides.has(side);
        return (
          <article key={side} className="card space-y-2">
            <header className="flex items-center justify-between">
              <h3 className="font-medium">
                {side === "A" ? match.team_a_name : match.team_b_name}{" "}
                <span className="text-xs text-muted-foreground">
                  {canWrite ? "(team gross)" : "(read-only · opponent)"}
                </span>
              </h3>
            </header>
            <ul className="divide-y divide-line">
              {holes.map((h) => {
                const k = `team:${side}|${h.hole_number}`;
                return (
                  <HoleRow
                    key={k}
                    hole={h}
                    value={scores.get(k) ?? null}
                    status={canWrite ? statusFor(k) : "saved"}
                    readOnly={!canWrite}
                    onChange={
                      canWrite
                        ? (gross) =>
                            writeHole({
                              player_id: null,
                              team_side: side,
                              hole_number: h.hole_number,
                              gross,
                            })
                        : () => undefined
                    }
                  />
                );
              })}
            </ul>
          </article>
        );
      })}
    </section>
  );
}

type WriteHole = (input: {
  player_id: string | null;
  team_side: "A" | "B" | null;
  hole_number: number;
  gross: number | null;
}) => void;

function SinglesEntry({
  holes,
  sideAPlayers,
  sideBPlayers,
  scores,
  statusFor,
  writeHole,
}: {
  holes: Hole[];
  sideAPlayers: SidePlayer[];
  sideBPlayers: SidePlayer[];
  scores: Map<string, number>;
  statusFor: (k: string) => SyncIndicator;
  writeHole: WriteHole;
}) {
  const groups: { name: string; player: SidePlayer }[] = [
    ...sideAPlayers.map((p) => ({ name: "Side A", player: p })),
    ...sideBPlayers.map((p) => ({ name: "Side B", player: p })),
  ];

  return (
    <section className="space-y-3">
      <h2 className="label">Singles · enter gross per hole</h2>
      {groups.map(({ name, player }) => (
        <article key={player.id} className="card space-y-2">
          <header>
            <h3 className="font-medium">
              {player.name}{" "}
              <span className="text-xs text-muted-foreground">
                · {name} · idx {player.handicap_index.toFixed(1)}
              </span>
            </h3>
          </header>
          <PlayerHoleList
            player={player}
            holes={holes}
            scores={scores}
            statusFor={statusFor}
            writeHole={writeHole}
          />
        </article>
      ))}
    </section>
  );
}

function BestBallEntry({
  holes,
  sideAPlayers,
  sideBPlayers,
  scores,
  statusFor,
  writeHole,
}: {
  holes: Hole[];
  sideAPlayers: SidePlayer[];
  sideBPlayers: SidePlayer[];
  scores: Map<string, number>;
  statusFor: (k: string) => SyncIndicator;
  writeHole: WriteHole;
}) {
  const sides: { label: string; players: SidePlayer[] }[] = [
    { label: "Side A", players: sideAPlayers },
    { label: "Side B", players: sideBPlayers },
  ];

  return (
    <section className="space-y-3">
      <h2 className="label">Best ball + bonus · each partner enters their own</h2>
      {sides.map(({ label, players: sps }) => (
        <article key={label} className="card space-y-3">
          <h3 className="font-medium">{label}</h3>
          {sps.map((p) => (
            <div key={p.id} className="space-y-1.5">
              <p className="text-sm font-medium">
                {p.name}{" "}
                <span className="text-xs text-muted-foreground">idx {p.handicap_index.toFixed(1)}</span>
              </p>
              <PlayerHoleList
                player={p}
                holes={holes}
                scores={scores}
                statusFor={statusFor}
                writeHole={writeHole}
              />
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

function PlayerHoleList({
  player,
  holes,
  scores,
  statusFor,
  writeHole,
}: {
  player: SidePlayer;
  holes: Hole[];
  scores: Map<string, number>;
  statusFor: (k: string) => SyncIndicator;
  writeHole: WriteHole;
}) {
  // Pre-compute stroke allocation so each row can show a "+1" stroke badge.
  const ch = courseHandicap({ index: player.handicap_index }, { holes }, "simple");
  const strokeMap = allocateStrokes(ch, holes);

  return (
    <ul className="divide-y divide-line">
      {holes.map((h) => {
        const k = `${player.id}|${h.hole_number}`;
        return (
          <HoleRow
            key={k}
            hole={h}
            value={scores.get(k) ?? null}
            strokesReceived={strokeMap.get(h.hole_number) ?? 0}
            status={statusFor(k)}
            onChange={(gross) =>
              writeHole({
                player_id: player.id,
                team_side: null,
                hole_number: h.hole_number,
                gross,
              })
            }
          />
        );
      })}
    </ul>
  );
}

function HoleRow({
  hole,
  value,
  strokesReceived = 0,
  status,
  readOnly = false,
  onChange,
}: {
  hole: Hole;
  value: number | null;
  strokesReceived?: number;
  status: SyncIndicator;
  readOnly?: boolean;
  onChange: (gross: number | null) => void;
}) {
  const net = value != null ? value - strokesReceived : null;

  return (
    <li className="flex items-center gap-3 py-2">
      <div className="w-14">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Hole</div>
        <div className="font-serif text-lg font-semibold tabular-nums">{hole.hole_number}</div>
      </div>
      <div className="w-16 text-[11px] leading-tight text-muted-foreground">
        Par {hole.par}
        <br />
        SI {hole.stroke_index}
        {strokesReceived > 0 && (
          <span className="ml-1 inline-flex items-center rounded-full bg-[hsl(var(--gold))]/20 px-1.5 text-[10px] font-medium text-[hsl(var(--ink))]">
            +{strokesReceived}
          </span>
        )}
      </div>
      <div className="ml-auto flex flex-col items-end gap-1">
        {readOnly ? (
          <span className="h-11 inline-flex items-center px-2 text-lg font-semibold tabular-nums text-muted-foreground">
            {value ?? "—"}
          </span>
        ) : (
          <Stepper value={value} onChange={onChange} ariaLabel={`Hole ${hole.hole_number} gross`} />
        )}
        <div className="flex items-center gap-2">
          {net != null && (
            <span className="text-[11px] text-muted-foreground">net {net}</span>
          )}
          {!readOnly && <SyncDot status={status} />}
        </div>
      </div>
    </li>
  );
}
