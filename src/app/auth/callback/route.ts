import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback. Supports both flows Supabase can throw at us:
 *
 *  - `?code=<pkce>` — needs the PKCE code_verifier cookie set during
 *    signInWithOtp on the same browser. Fails cross-device.
 *  - `?token_hash=<hash>&type=email|magiclink|recovery|invite|email_change`
 *    — cookie-free, works no matter which device opens the email.
 *
 * Whichever shows up, we exchange it for a session and redirect to `next`.
 * On failure we surface a friendly error on /login so the user has a clear
 * path back in (instead of silently landing on the home page logged out).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/leaderboard";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    // PKCE code exchange most commonly fails when the user opens the email
    // on a different browser/device than where they requested the link
    // (the code_verifier cookie isn't there). Tell them so.
    const msg =
      error.message ||
      "Sign-in link expired or opened in a different browser. Request a new one.";
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(msg)}`);
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
