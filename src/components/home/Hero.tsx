import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Hero({
  signedIn,
}: {
  signedIn: boolean;
}) {
  return (
    <section className="animate-fade-in flex flex-col items-center px-6 py-20 text-center md:py-28">
      <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
        Est. on the first tee
      </p>
      <h1 className="font-serif text-5xl font-semibold tracking-tight text-foreground md:text-7xl">
        The Bobo Golf Trip
      </h1>
      <p className="mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
        A tradition unlike any other. Live net scoring, every round, every bet —
        settled between the boys.
      </p>
      <div className="mt-10">
        <Link href={signedIn ? "/trips" : "/login"}>
          <Button size="lg" className="px-8">
            {signedIn ? "Go to your trips" : "Sign in to get started"}
          </Button>
        </Link>
      </div>
    </section>
  );
}
