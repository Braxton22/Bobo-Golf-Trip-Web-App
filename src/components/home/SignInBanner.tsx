import Link from "next/link";
import { LogIn } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function SignInBanner() {
  return (
    <Card className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:justify-between sm:text-left">
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <LogIn className="h-5 w-5" />
        </span>
        <div>
          <p className="font-serif text-lg font-semibold text-foreground">
            Join the trip
          </p>
          <p className="text-sm text-muted-foreground">
            Sign in to post scores and play along.
          </p>
        </div>
      </div>
      <Link href="/login" className="w-full sm:w-auto">
        <Button variant="accent" className="w-full sm:w-auto">
          Sign in
        </Button>
      </Link>
    </Card>
  );
}
