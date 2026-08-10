"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TRIAL_DAYS } from "@/lib/trial";
import { PLATFORM_TERMS_VERSION } from "@/lib/platformTerms";

export type AuthActionState = { error: string | null; message: string | null };

export async function signIn(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message, message: null };
  }

  redirect("/dashboard");
}

export async function signUp(
  _prevState: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const companyName = String(formData.get("companyName") ?? "").trim();
  const termsAccepted = formData.get("termsAccepted") === "on";

  // The client-side disabled button isn't a security boundary — someone
  // could submit the form directly, so this is checked here too, before an
  // auth user is even created (an unchecked box shouldn't leave behind an
  // orphaned auth.users row with no matching profile).
  if (!termsAccepted) {
    return {
      error: "You must agree to the Terms of Service to create an account.",
      message: null,
    };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const termsAcceptedAt = new Date().toISOString();

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // terms_accepted*/version carried in metadata too, not just the
      // insert below — if email confirmation is required, the insert
      // happens later (app/(dashboard)/layout.tsx's fallback) on a
      // different request with no access to this form submission, so it
      // has to read the *original* acceptance moment back out of here
      // rather than recording the (much later) confirmation moment.
      data: {
        company_name: companyName,
        terms_accepted: true,
        terms_accepted_at: termsAcceptedAt,
        terms_version: PLATFORM_TERMS_VERSION,
      },
      // Confirmation email links land here to exchange the code for a
      // session — see app/auth/callback/route.ts.
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: error.message, message: null };
  }

  if (!data.session || !data.user) {
    return {
      error: null,
      message: "Account created — check your email to confirm it, and you'll be signed in automatically.",
    };
  }

  // Own-row insert, allowed by the Phase 2 RLS insert policy. The dashboard
  // layout also does this as a fallback for accounts confirmed later.
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error: profileError } = await supabase.from("users").insert({
    id: data.user.id,
    email,
    company_name: companyName || null,
    trial_ends_at: trialEndsAt,
    terms_accepted: true,
    terms_accepted_at: termsAcceptedAt,
    terms_version: PLATFORM_TERMS_VERSION,
  });

  if (profileError) {
    return {
      error: `Account created, but profile setup failed: ${profileError.message}`,
      message: null,
    };
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
