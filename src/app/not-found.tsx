import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Flag, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-8">
      <div className="w-full max-w-md animate-fade-in text-center">
        <span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-primary shadow-soft">
          <Flag className="h-7 w-7" />
        </span>
        <p className="font-serif text-6xl font-semibold leading-none text-primary/30">
          404
        </p>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-primary">
          Out of bounds
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
          That page doesn&apos;t exist — or it&apos;s outside your scorecard.
          Let&apos;s get you back to the clubhouse.
        </p>
        <Link
          href="/"
          className={`${buttonVariants({ variant: "default", size: "lg" })} mt-7`}
        >
          <ArrowLeft className="h-4 w-4" />
          Head home
        </Link>
      </div>
    </div>
  );
}
