import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveTrip } from "@/lib/trip-context";
import { buildFeedItems, FEED_COLOR, FEED_ICON, relTime } from "@/lib/feed";
import { FeedRefresh } from "./refresh";

export default async function FeedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/feed");

  const trip = await getActiveTrip();
  if (!trip) {
    return (
      <div className="card text-center space-y-2">
        <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
        <h1 className="font-serif text-xl font-semibold">No active trip</h1>
      </div>
    );
  }

  const items = await buildFeedItems(supabase, trip.id);

  return (
    <div className="space-y-4">
      <FeedRefresh tripId={trip.id} />
      <header>
        <h1 className="font-serif text-3xl font-semibold">Feed</h1>
        <p className="text-sm text-muted-foreground">{trip.name}</p>
      </header>

      {items.length === 0 ? (
        <p className="card text-sm text-muted-foreground">
          Quiet on the course. Birdies, match leads, and settled bets will land here as they happen.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => {
            const Icon = FEED_ICON[it.type] ?? FEED_ICON.default;
            const color = FEED_COLOR[it.type] ?? "text-muted-foreground";
            return (
              <li key={it.id} className="card flex items-center gap-3 py-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-full bg-card border border-line ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{it.text}</p>
                  {it.hint && <p className="text-[11px] text-muted-foreground">{it.hint}</p>}
                </div>
                <time className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {relTime(it.created_at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
