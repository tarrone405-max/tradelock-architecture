import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  PenTool,
  DollarSign,
  Sparkles,
  FolderPlus,
  MapPin,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import CopyLinkButton from "@/components/CopyLinkButton";
import OfflinePaymentMenu from "@/components/OfflinePaymentMenu";
import NewProjectForm from "@/components/NewProjectForm";
import {
  GRACE_PERIOD_DAYS,
  PLANS,
  isPlanTier,
  type PlanTier,
} from "@/lib/plans";

const SETTLED_POSITIVE = ["approved", "paid", "cash", "check", "financed"];

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: profile }, { data: projects }, { data: changeOrders }] =
    await Promise.all([
      supabase
        .from("users")
        .select(
          "subscription_tier, subscription_status, subscription_grace_period_started_at"
        )
        .eq("id", user!.id)
        .maybeSingle(),

      supabase
        .from("projects")
        .select(
          "id, client_name, property_address, unique_token, portal_token_revoked_at, created_at"
        )
        .order("created_at", { ascending: false }),

      // RLS already scopes this to change orders on projects this provider owns.
      supabase
        .from("change_orders")
        .select(
          "id, project_id, status, cost, created_at, client_signed_at, provider_signed_at"
        )
        .order("created_at", { ascending: false }),
    ]);

  const projectList = projects ?? [];
  const orders = changeOrders ?? [];

  const currentTier: PlanTier = isPlanTier(profile?.subscription_tier)
    ? profile.subscription_tier
    : "free";

  const subscriptionStatus = profile?.subscription_status ?? "inactive";

  const totalProjects = projectList.length;

  const pendingSignatures = orders.filter(
    (o) => o.status === "pending"
  ).length;

  // Revenue that has actually been settled through Stripe, cash,
  // check, or financing.
  const paidRevenue = orders
    .filter((o) =>
      ["paid", "cash", "check", "financed"].includes(o.status)
    )
    .reduce((sum, o) => sum + Number(o.cost), 0);

  // Fully approved work that has not yet been settled.
  const outstandingRevenue = orders
    .filter((o) => o.status === "approved")
    .reduce((sum, o) => sum + Number(o.cost), 0);

  // orders is already sorted newest-first, so this preserves that order —
  // useful both for the rollup status below and for picking "the" active
  // change order a dashboard card's quick-action menu should target.
  const ordersByProject = new Map<string, typeof orders>();

  for (const order of orders) {
    const list = ordersByProject.get(order.project_id) ?? [];
    list.push(order);
    ordersByProject.set(order.project_id, list);
  }

  function projectStatus(projectId: string) {
    const projectOrders = ordersByProject.get(projectId) ?? [];

    if (projectOrders.length === 0) return "none";

    if (projectOrders.some((o) => o.status === "pending")) {
      return "pending";
    }

    if (
      projectOrders.some((o) => SETTLED_POSITIVE.includes(o.status))
    ) {
      return "approved";
    }

    return "declined";
  }

  // The one change order a project card's offline-payment menu acts on —
  // its most recently created fully-executed (both signatures in),
  // not-yet-settled order, if any.
  function activeChangeOrder(projectId: string) {
    const projectOrders = ordersByProject.get(projectId) ?? [];

    return (
      projectOrders.find(
        (o) =>
          o.status === "approved" &&
          o.client_signed_at &&
          o.provider_signed_at
      ) ?? null
    );
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Grace-period deadline for a past_due paid plan.
  const graceDeadline =
    subscriptionStatus === "past_due" &&
    profile?.subscription_grace_period_started_at
      ? new Date(
          new Date(
            profile.subscription_grace_period_started_at
          ).getTime() +
            GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
        )
      : null;

  return (
    <div className="space-y-6">
      {/* Dashboard stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard
          label="Total projects"
          value={String(totalProjects)}
          icon={Briefcase}
          tone="blue"
        />

        <StatCard
          label="Pending signatures"
          value={String(pendingSignatures)}
          icon={PenTool}
          tone="amber"
        />

        <StatCard
          label="Paid revenue"
          value={currency.format(paidRevenue)}
          icon={DollarSign}
          tone="green"
        />

        <StatCard
          label="Outstanding"
          value={currency.format(outstandingRevenue)}
          icon={DollarSign}
          tone="amber"
        />
      </div>

      {/* Billing alerts */}
      {subscriptionStatus === "past_due" ? (
        <div className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>

              <div>
                <p className="font-semibold text-gray-900">
                  Your last payment didn&rsquo;t go through
                </p>

                <p className="mt-0.5 text-sm text-gray-900">
                  {graceDeadline
                    ? `You'll keep your current plan until ${graceDeadline.toLocaleDateString()} — after that it reverts to Free.`
                    : "Update your payment method to keep your current plan."}
                </p>
              </div>
            </div>

            <Link
              href="/dashboard/billing"
              className="shrink-0 rounded-lg bg-gray-900 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
            >
              Fix billing
            </Link>
          </div>
        </div>
      ) : (
        currentTier === "free" && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Sparkles className="h-5 w-5" />
                </div>

                <div>
                  <p className="font-semibold text-gray-900">
                    You&rsquo;re on the Free plan
                  </p>

                  <p className="mt-0.5 text-sm text-gray-900">
                    {PLANS.free.applicationFeeBps / 100}% TradeLock fee on
                    client payments. Upgrade to Pro or Business for 0%.
                  </p>
                </div>
              </div>

              <Link
                href="/dashboard/billing"
                className="shrink-0 rounded-lg bg-gray-900 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
              >
                View plans
              </Link>
            </div>
          </div>
        )
      )}

      {/* New project */}
      <section
        id="new-project"
        className="rounded-xl border border-gray-200 bg-white p-5"
      >
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
            <FolderPlus className="h-4 w-4" />
          </div>

          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              New project
            </h2>

            <p className="text-xs font-medium text-gray-900">
              We&rsquo;ll generate a private portal link for your client.
            </p>
          </div>
        </div>

        <NewProjectForm />
      </section>

      {/* Projects */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Your projects
        </h2>

        {projectList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Briefcase className="h-5 w-5 text-gray-500" />
            </div>

            <p className="mt-3 text-sm font-medium text-gray-900">
              No projects yet
            </p>

            <p className="mt-1 text-sm text-gray-900">
              Create your first project to generate a client portal link.
            </p>

            <a
              href="#new-project"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
            >
              <FolderPlus className="h-4 w-4" />
              Add your first project
            </a>
          </div>
        ) : (
          <ul className="space-y-3">
            {projectList.map((project) => {
              const active = activeChangeOrder(project.id);

              return (
                <li
                  key={project.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-sm sm:p-5"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="font-semibold text-gray-900 hover:underline"
                        >
                          {project.client_name}
                        </Link>

                        <StatusBadge
                          status={projectStatus(project.id)}
                        />
                      </div>

                      {project.property_address && (
                        <p className="mt-1 flex items-center gap-1 text-sm text-gray-900">
                          <MapPin className="h-3.5 w-3.5 text-gray-500" />
                          {project.property_address}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {project.portal_token_revoked_at ? (
                        <span className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                          Link revoked
                        </span>
                      ) : (
                        <CopyLinkButton
                          url={`${siteUrl}/p/${project.unique_token}`}
                        />
                      )}

                      {active && (
                        <OfflinePaymentMenu
                          changeOrderId={active.id}
                        />
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}