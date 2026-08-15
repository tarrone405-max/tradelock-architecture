import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth cookie on every protected request and bounces
// signed-out visitors to /login. Server Components still re-check
// auth.getUser() themselves (see app/(dashboard)/layout.tsx) — proxy alone
// isn't a substitute for that per Supabase's own guidance.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // No blanket entitlement gate here anymore: Free is a real, fully-entitled
  // plan (see lib/plans.ts), not a locked/paywall state, so simply being
  // signed in is enough to reach the dashboard — same as any paid tier.
  // TradeLock has no paid-only feature yet; if/when one exists, gate that
  // specific route/action against lib/plans.ts's `features` (e.g.
  // `planHasFeature(tier, "someFeature")`) rather than reintroducing a
  // blanket redirect here.
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
