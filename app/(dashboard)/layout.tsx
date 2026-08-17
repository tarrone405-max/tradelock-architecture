import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  CreditCard,
  LogOut,
  MessageSquareWarning,
  Settings,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import { TRIAL_DAYS } from "@/lib/trial";
import { ensureDefaultOrganization } from "@/src/core/organizations/service";
import { getCurrentOrganization } from "@/src/core/organizations/current";
import { OrganizationProvider } from "@/src/core/organizations/OrganizationProvider";

import BackToDashboard from "@/components/BackToDashboard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ==========================================================
  // AUTHENTICATION
  // ==========================================================

  if (!user) {
    redirect("/login");
  }

  // ==========================================================
  // PROFILE SAFETY NET
  // ==========================================================

  const { data: profile } = await supabase
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    const trialEndsAt = new Date(
      Date.now() +
        TRIAL_DAYS *
          24 *
          60 *
          60 *
          1000
    ).toISOString();

    await supabase.from("users").insert({
      id: user.id,

      email: user.email,

      company_name:
        (user.user_metadata
          ?.company_name as
          | string
          | undefined) ?? null,

      trial_ends_at:
        trialEndsAt,

      terms_accepted:
        (user.user_metadata
          ?.terms_accepted as
          | boolean
          | undefined) ?? false,

      terms_accepted_at:
        (user.user_metadata
          ?.terms_accepted_at as
          | string
          | undefined) ?? null,

      terms_version:
        (user.user_metadata
          ?.terms_version as
          | string
          | undefined) ?? null,
    });
  }

  // ==========================================================
  // ORGANIZATION SAFETY NET
  // ==========================================================
  //
  // Mirrors the profile safety net above: every user needs at least one
  // organization to own their projects/change_orders/terms_of_service.
  // The migration backfills one for every user that existed when it was
  // applied (see supabase/migrations/20260817120000_add_organizations.sql);
  // this covers anyone who signs up afterward, until Milestone 2's creation
  // wizard replaces this with a real onboarding flow.

  await ensureDefaultOrganization(
    user.id,
    (user.user_metadata?.company_name as string | undefined) ?? null
  );

  const organization = await getCurrentOrganization();

  // ==========================================================
  // DASHBOARD LAYOUT
  // ==========================================================

  return (
    <OrganizationProvider organization={organization}>
    <div className="min-h-screen bg-gray-50">
      {/* ======================================================
          HEADER
          ====================================================== */}

      <header className="flex items-center justify-between border-b bg-white px-4 py-3 sm:px-6">
        {/* Brand */}

        <Link
          href="/dashboard"
          className="text-lg font-semibold text-gray-900 transition-colors hover:text-gray-700"
        >
          TradeLock
        </Link>

        {/* Navigation */}

        <div className="flex items-center gap-4">
          {/* Settings */}

          <Link
            href="/dashboard/settings"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-900 transition-colors hover:text-gray-600"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>

          {/* Reports */}

          <Link
            href="/dashboard/reports"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-900 transition-colors hover:text-gray-600"
          >
            <BarChart3 className="h-4 w-4" />
            Reports
          </Link>

          {/* Billing */}

          <Link
            href="/dashboard/billing"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-900 transition-colors hover:text-gray-600"
          >
            <CreditCard className="h-4 w-4" />
            Billing
          </Link>

          {/* Feedback */}

          <Link
            href="/dashboard/feedback"
            className="flex items-center gap-1.5 text-sm font-medium text-gray-900 transition-colors hover:text-gray-600"
          >
            <MessageSquareWarning className="h-4 w-4" />
            Feedback
          </Link>

          {/* Sign out */}

          <form action={signOut}>
            <button
              type="submit"
              className="flex items-center gap-1.5 text-sm font-medium text-gray-900 transition-colors hover:text-gray-600"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* ======================================================
          MAIN CONTENT
          ====================================================== */}

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Back to Dashboard */}

        <BackToDashboard />

        {/* Current dashboard page */}

        {children}
      </main>
    </div>
    </OrganizationProvider>
  );
}