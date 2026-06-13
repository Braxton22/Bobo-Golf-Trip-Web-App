import Link from "next/link";
import { redirect } from "next/navigation";
import { Flag, Smartphone, Trophy, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Signed in → straight to the live board.
  if (user) redirect("/leaderboard");

  return (
    <div className="space-y-10 pt-6 pb-12">
      <section className="text-center space-y-4">
        <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft">
          <Flag className="h-6 w-6" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          Your trip, kept
        </p>
        <h1 className="font-serif text-4xl font-semibold leading-tight sm:text-5xl">
          Every round.<br />
          Every bet.<br />
          One place.
        </h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          From the annual cup to a quiet solo loop — live scoring, handicaps,
          and side action, all on your phone.
        </p>
        <div className="flex flex-col items-center gap-2 pt-2">
          <Link href="/login" className="btn w-full max-w-xs">
            Sign in with magic link
          </Link>
          <Link href="/format" className="btn-ghost w-full max-w-xs">
            How it works
          </Link>
          <p className="text-xs text-muted-foreground">Have a join code? Sign in then visit /join/&lt;code&gt;.</p>
        </div>
      </section>

      <ul className="grid gap-3 sm:grid-cols-3">
        <FeatureCard
          icon={Trophy}
          title="Built for any format"
          blurb="Ryder Cup matches, medal play, stableford, skins, scramble, count-your-birdies — pick one per trip or mix them per round."
        />
        <FeatureCard
          icon={Smartphone}
          title="Score per hole, offline"
          blurb="Big steppers, net auto-computed from your handicap and the stroke index. Survives dead zones."
        />
        <FeatureCard
          icon={Wallet}
          title="Settle up clean"
          blurb="Match bets and round pots tallied automatically, simplified to the fewest payments, one tap to Venmo."
        />
      </ul>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  blurb,
}: {
  icon: typeof Flag;
  title: string;
  blurb: string;
}) {
  return (
    <li className="card">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h2 className="mt-3 font-serif text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
    </li>
  );
}
