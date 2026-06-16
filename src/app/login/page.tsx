"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flag, Mail, CheckCircle2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  // Surface a failed callback ("?error=...") so the user understands why
  // they're back on the login page instead of signed in.
  useEffect(() => {
    const err = searchParams.get("error");
    if (!err) return;
    setError(
      err === "auth"
        ? "Couldn't finish sign-in. Please request a new link and open it in the same browser."
        : err
    );
    setStatus("error");
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError(null);
    const supabase = createClient();
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/callback` },
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-8">
      <div className="w-full max-w-md animate-fade-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lift">
            <Flag className="h-6 w-6" />
          </span>
          <h1 className="font-serif text-4xl font-semibold tracking-tight text-primary">
            Welcome back
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to the Bobo Golf Trip clubhouse.
          </p>
        </div>

        <Card className="shadow-lift">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Drop your email and we&apos;ll send a magic link.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={status === "sending"}
              >
                <Mail className="h-4 w-4" />
                {status === "sending" ? "Sending…" : "Send magic link"}
              </Button>
            </form>

            {status === "sent" && (
              <div className="mt-4 flex items-start gap-2.5 rounded-md border border-border bg-muted p-3 text-sm text-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p>Check your inbox — click the link to sign in.</p>
              </div>
            )}
            {error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
