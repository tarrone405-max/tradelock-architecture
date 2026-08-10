import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Supabase's email-confirmation link redirects here with a `code` query
// param (set via emailRedirectTo in app/actions/auth.ts:signUp). Exchanging
// it sets the session cookie via our SSR client, so the user lands on
// /dashboard already signed in instead of having to re-enter their password.
export async function GET(request: Request) {
const { searchParams } = new URL(request.url);
const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const url = new URL("/login", origin);
  url.searchParams.set("error", "confirmation-failed");
  return NextResponse.redirect(url);
}
