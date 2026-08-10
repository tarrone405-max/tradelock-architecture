import Link from "next/link";
import { Briefcase, PenTool, DollarSign, Sparkles, User, Mail, MapPin, FolderPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession } from "@/app/actions/billing";
import { createProject } from "./actions";
import StatCard from "@/components/StatCard";
import StatusBadge from "@/components/StatusBadge";
import CopyLinkButton from "@/components/CopyLinkButton";
import OfflinePaymentMenu from "@/components/OfflinePaymentMenu";
import { TRIAL_DAYS } from "@/lib/trial";

const SETTLED_POSITIVE = ["approved", "paid", "cash", "check", "financed"];

const fieldClass =
  "block w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm transition-shadow placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10";

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

  const [{ data: profile }, { data: projects }, { data: changeOrders }] = await Promise.all([
    supabase
      .from("users")
      .select("subscription_status, trial_ends_at")
      .eq("id", user!.id)
      .maybeSingle(),
    supabase
      .from("projects")
      .select("id, client_name, property_address, unique_token, portal_token_revoked_at, created_at")
      .order("created_at", { ascending: false }),
    // RLS already scopes this to change orders on projects this provider owns.
    supabase
      .from("change_orders")
      .select("id, project_id, status, cost, created_at, client_signed_at, provider_signed_at")
      .order("created_at", { ascending: false }),
  ]);

  const projectList = projects ?? [];
  const orders = changeOrders ?? [];
  const isActive = profile?.subscription_status === "active";

  const totalProjects = projectList.length;
  const pendingSignatures = orders.filter((o) => o.status === "pending").length;
  const approvedRevenue = orders
    .filter((o) => SETTLED_POSITIVE.includes(o.status))
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
    if (projectOrders.some((o) => o.status === "pending")) return "pending";
    if (projectOrders.some((o) => SETTLED_POSITIVE.includes(o.status))) return "approved";
    return "declined";
  }

  // The one change order a project card's offline-payment menu acts on —
  // its most recently created fully-executed (both signatures in), not-yet-
  // settled order, if any. Matches the settlement rule recordOfflinePayment
  // enforces server-side: a pending or only-client-signed order isn't
  // eligible, so it's excluded here too rather than showing a menu action
  // that would just fail.
  function activeChangeOrder(projectId: string) {
    const projectOrders = ordersByProject.get(projectId) ?? [];
    return (
      projectOrders.find(
        (o) => o.status === "approved" && o.client_signed_at && o.provider_signed_at
      ) ?? null
    );
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Reading the real, stored trial_ends_at now (set at signup, see
  // app/actions/auth.ts) rather than computing it ad hoc from created_at —
  // this is the same value proxy.ts's hard enforcement gate checks, so if
  // you're seeing this page at all you're either active or still within a
  // genuinely valid trial. The banner is just a heads-up during that window.
  const trialEndsAt = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
  const msLeft = trialEndsAt ? trialEndsAt.getTime() - Date.now() : 0;
  const daysLeft = Math.max(Math.ceil(msLeft / (1000 * 60 * 60 * 24)), 0);
  const trialExpired = daysLeft === 0;
  const daysElapsed = TRIAL_DAYS - daysLeft;
  const trialProgressPct = Math.min((daysElapsed / TRIAL_DAYS) * 100, 100);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total projects" value={String(totalProjects)} icon={Briefcase} tone="blue" />
        <StatCard
          label="Pending signatures"
          value={String(pendingSignatures)}
          icon={PenTool}
          tone="amber"
        />
        <StatCard
          label="Approved revenue"
          value={currency.format(approvedRevenue)}
          icon={DollarSign}
          tone="green"
        />
      </div>

      {!isActive && (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  trialExpired ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                }`}
              >
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {trialExpired
                    ? "Your trial has ended"
                    : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your trial`}
                </p>
                <p className="mt-0.5 text-sm text-gray-900">
                  Upgrade to TradeLock Pro to keep sending unlimited client portals.
                </p>
              </div>
            </div>
            <form action={createCheckoutSession} className="shrink-0">
              <button
                type="submit"
                className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 sm:w-auto"
              >
                Upgrade — $49/mo
              </button>
            </form>
          </div>
          <div className="h-1.5 w-full bg-gray-100">
            <div
              className={`h-full transition-[width] ${trialExpired ? "bg-red-500" : "bg-amber-500"}`}
              style={{ width: `${trialProgressPct}%` }}
            />
          </div>
        </div>
      )}

      <section id="new-project" className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
            <FolderPlus className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">New project</h2>
            <p className="text-xs font-medium text-gray-900">
              We&rsquo;ll generate a private portal link for your client.
            </p>
          </div>
        </div>
        <form action={createProject} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-900">Client name</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                name="clientName"
                type="text"
                required
                placeholder="Jane Homeowner"
                className={fieldClass}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-900">
                Client email <span className="text-gray-900">(optional)</span>
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  name="clientEmail"
                  type="email"
                  placeholder="jane@email.com"
                  className={fieldClass}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-900">
                Property address <span className="text-gray-900">(optional)</span>
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  name="propertyAddress"
                  type="text"
                  placeholder="123 Main St"
                  className={fieldClass}
                />
              </div>
            </div>
          </div>
          <button
            type="submit"
            className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800"
          >
            Create project
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Your projects</h2>
        {projectList.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
              <Briefcase className="h-5 w-5 text-gray-500" />
            </div>
            <p className="mt-3 text-sm font-medium text-gray-900">No projects yet</p>
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
                        <StatusBadge status={projectStatus(project.id)} />
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
                        <CopyLinkButton url={`${siteUrl}/p/${project.unique_token}`} />
                      )}
                      {active && <OfflinePaymentMenu changeOrderId={active.id} />}
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
