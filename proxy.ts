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

  // Hard entitlement gate: active subscription or still-valid trial. The
  // billing page itself is always exempt, or there'd be no way to reach the
  // Subscribe button. A missing profile row (brand-new account, not yet
  // synced by app/(dashboard)/layout.tsx's fallback insert) fails OPEN —
  // it gets a real trial_ends_at on its very next request once that insert
  // runs, so there's nothing to gate yet.
  if (request.nextUrl.pathname !== "/dashboard/billing") {
    const { data: profile } = await supabase
      .from("users")
      .select("subscription_status, trial_ends_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profile) {
      const isActive = profile.subscription_status === "active";
      const trialValid =
        !!profile.trial_ends_at && new Date(profile.trial_ends_at).getTime() > Date.now();

      if (!isActive && !trialValid) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard/billing";
        return NextResponse.redirect(url);
      }
    }
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
