import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { TRIAL_DAYS } from "@/lib/trial";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Safety net for accounts whose profile row wasn't created at sign-up
  // time (e.g. email confirmation was required, so no session existed yet
  // when app/actions/auth.ts:signUp ran). Own-row insert, RLS-permitted.
  const { data: profile } = await supabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    // terms_accepted* / terms_version were carried in auth user_metadata
    // from the original signup submission (see app/actions/auth.ts) — this
    // deferred insert only runs when email confirmation pushed profile
    // creation to a later request, so it has no form data of its own.
    await supabase.from("users").insert({
      id: user.id,
      email: user.email,
      company_name: (user.user_metadata?.company_name as string | undefined) ?? null,
      trial_ends_at: trialEndsAt,
      terms_accepted: (user.user_metadata?.terms_accepted as boolean | undefined) ?? false,
      terms_accepted_at: (user.user_metadata?.terms_accepted_at as string | undefined) ?? null,
      terms_version: (user.user_metadata?.terms_version as string | undefined) ?? null,
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3 sm:px-6">
        <span className="text-lg font-semibold text-gray-900">TradeLock</span>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/settings"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-900"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 text-sm font-medium text-gray-900 hover:text-gray-900"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
