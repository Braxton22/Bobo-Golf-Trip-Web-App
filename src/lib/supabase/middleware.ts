import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  // Belt-and-suspenders: if any auth code reaches a non-callback path (this
  // happens when Supabase falls back to the project's Site URL because the
  // redirect_to value isn't on the allow-list), forward to /auth/callback so
  // the session actually gets created. Otherwise the user lands on a normal
  // page with `?code=` in the URL and appears not logged in.
  const reqUrl = request.nextUrl;
  const isAuthPath = reqUrl.pathname.startsWith("/auth/");
  const hasAuthQuery =
    reqUrl.searchParams.has("code") ||
    (reqUrl.searchParams.has("token_hash") && reqUrl.searchParams.has("type"));
  if (hasAuthQuery && !isAuthPath) {
    const fwd = reqUrl.clone();
    fwd.pathname = "/auth/callback";
    if (!fwd.searchParams.has("next")) {
      fwd.searchParams.set("next", reqUrl.pathname === "/" ? "/leaderboard" : reqUrl.pathname);
    }
    return NextResponse.redirect(fwd);
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/auth") ||
    path.startsWith("/_next") ||
    path.startsWith("/favicon");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  return response;
}
