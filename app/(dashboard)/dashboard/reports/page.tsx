import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Banknote,
  CreditCard,
  DollarSign,
  Download,
  FileCheck2,
  Clock3,
  Receipt,
  Repeat,
  Star,
  TrendingUp,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getUserPlan } from "@/lib/planAccess";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const PAID_STATUSES = ["paid", "cash", "check", "financed"];

export default async function ReportsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const plan = await getUserPlan(user.id);

  if (!plan.features.financialReports) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-white">
            <BarChart3 className="h-6 w-6" />
          </div>

          <h1 className="mt-5 text-xl font-bold text-gray-900">
            Financial reports are a Pro feature
          </h1>

          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-gray-600">
            Track paid revenue, outstanding payments, payment methods, and
            change-order performance with TradeLock Pro.
          </p>

          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/dashboard/billing"
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
            >
              View Pro & Business
            </Link>

            <Link
              href="/dashboard"
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [{ data: changeOrders, error }, { data: projects }, { data: reviews }] =
    await Promise.all([
      supabase
        .from("change_orders")
        .select(
          "id, project_id, status, cost, created_at, paid_at, client_signed_at, provider_signed_at, stripe_checkout_session_id, stripe_charge_id, currency, application_fee_amount"
        )
        .order("created_at", { ascending: false }),
      supabase.from("projects").select("id, client_name, client_email"),
      supabase.from("reviews").select("rating"),
    ]);

  if (error) {
    throw new Error(`Could not load financial reports: ${error.message}`);
  }

  const orders = changeOrders ?? [];
  const projectList = projects ?? [];
  const reviewList = reviews ?? [];

  // Business-only (advancedReporting): monthly earnings trend, repeat
  // clients, and average provider response time. Kept separate from the
  // Pro-gated metrics above/below since they take real computation, not
  // just a sum — a meaningful reason for Business to cost more than Pro,
  // not just a bigger number on the same report.
  const canSeeAdvancedReporting = plan.features.advancedReporting;

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "short", year: "2-digit" });
  const monthlyEarnings = new Map<string, { label: string; totalCents: number }>();
  for (const order of orders) {
    if (order.status !== "paid" || !order.paid_at) continue;
    const paidDate = new Date(order.paid_at);
    const key = `${paidDate.getFullYear()}-${paidDate.getMonth()}`;
    const existing = monthlyEarnings.get(key);
    const cents = Math.round(Number(order.cost) * 100);
    if (existing) {
      existing.totalCents += cents;
    } else {
      monthlyEarnings.set(key, { label: monthLabel.format(paidDate), totalCents: cents });
    }
  }
  const monthlyEarningsTrend = [...monthlyEarnings.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-6)
    .map(([, value]) => value);
  const maxMonthlyCents = Math.max(1, ...monthlyEarningsTrend.map((m) => m.totalCents));

  const projectsByClient = new Map<string, number>();
  for (const project of projectList) {
    const key = (project.client_email || project.client_name).trim().toLowerCase();
    if (!key) continue;
    projectsByClient.set(key, (projectsByClient.get(key) ?? 0) + 1);
  }
  const repeatClientCount = [...projectsByClient.values()].filter((count) => count > 1).length;

  const responseTimesHours = orders
    .filter((order) => order.client_signed_at && order.provider_signed_at)
    .map(
      (order) =>
        (new Date(order.provider_signed_at as string).getTime() -
          new Date(order.client_signed_at as string).getTime()) /
        (1000 * 60 * 60)
    );
  const avgResponseHours =
    responseTimesHours.length > 0
      ? responseTimesHours.reduce((sum, hours) => sum + hours, 0) / responseTimesHours.length
      : null;

  // Pro+ (financialReports, which already gates this whole page): average
  // review score — a simple aggregate, unlike the Business-only metrics
  // above.
  const avgRating =
    reviewList.length > 0
      ? reviewList.reduce((sum, r) => sum + r.rating, 0) / reviewList.length
      : null;

  const paidOrders = orders.filter((order) =>
    PAID_STATUSES.includes(order.status)
  );

  const outstandingOrders = orders.filter(
    (order) => order.status === "approved"
  );

  const pendingOrders = orders.filter(
    (order) => order.status === "pending"
  );

  const declinedOrders = orders.filter(
    (order) => order.status === "declined"
  );

  const paidRevenue = paidOrders.reduce(
    (sum, order) => sum + Number(order.cost),
    0
  );

  const outstandingRevenue = outstandingOrders.reduce(
    (sum, order) => sum + Number(order.cost),
    0
  );

  const approvedWork = orders
    .filter((order) =>
      ["approved", ...PAID_STATUSES].includes(order.status)
    )
    .reduce((sum, order) => sum + Number(order.cost), 0);

  const stripeOrders = orders.filter(
    (order) =>
      order.status === "paid" || Boolean(order.stripe_checkout_session_id)
  );

  const cashOrders = orders.filter((order) => order.status === "cash");
  const checkOrders = orders.filter((order) => order.status === "check");
  const financedOrders = orders.filter(
    (order) => order.status === "financed"
  );

  const stripeRevenue = stripeOrders
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + Number(order.cost), 0);

  const cashRevenue = cashOrders.reduce(
    (sum, order) => sum + Number(order.cost),
    0
  );

  const checkRevenue = checkOrders.reduce(
    (sum, order) => sum + Number(order.cost),
    0
  );

  const financedRevenue = financedOrders.reduce(
    (sum, order) => sum + Number(order.cost),
    0
  );

  const stripeApplicationFees = stripeOrders.reduce(
    (sum, order) => sum + Number(order.application_fee_amount ?? 0) / 100,
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-gray-700" />
            <h1 className="text-xl font-bold text-gray-900">
              Financial reports
            </h1>
          </div>

          <p className="mt-1 text-sm text-gray-600">
            A snapshot of your TradeLock payment activity.
          </p>
        </div>

        <div className="flex items-center gap-4">
          {plan.features.dataExports ? (
            <a
              href="/api/reports/export"
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          ) : (
            <span
              title="Data export is a Pro feature"
              className="inline-flex items-center gap-2 text-sm font-medium text-gray-400"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </span>
          )}

          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </div>
      </div>

      {/* Primary financial metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-700">
              <DollarSign className="h-5 w-5" />
            </div>

            <span className="text-sm font-medium text-gray-600">
              Paid revenue
            </span>
          </div>

          <p className="mt-4 text-2xl font-bold text-gray-900">
            {currency.format(paidRevenue)}
          </p>

          <p className="mt-1 text-xs text-gray-500">
            {paidOrders.length} settled payment
            {paidOrders.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
              <Clock3 className="h-5 w-5" />
            </div>

            <span className="text-sm font-medium text-gray-600">
              Outstanding
            </span>
          </div>

          <p className="mt-4 text-2xl font-bold text-gray-900">
            {currency.format(outstandingRevenue)}
          </p>

          <p className="mt-1 text-xs text-gray-500">
            {outstandingOrders.length} approved unpaid{" "}
            {outstandingOrders.length === 1 ? "order" : "orders"}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <FileCheck2 className="h-5 w-5" />
            </div>

            <span className="text-sm font-medium text-gray-600">
              Approved work
            </span>
          </div>

          <p className="mt-4 text-2xl font-bold text-gray-900">
            {currency.format(approvedWork)}
          </p>

          <p className="mt-1 text-xs text-gray-500">
            Signed and settled/awaiting payment
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
              <Receipt className="h-5 w-5" />
            </div>

            <span className="text-sm font-medium text-gray-600">
              Total orders
            </span>
          </div>

          <p className="mt-4 text-2xl font-bold text-gray-900">
            {orders.length}
          </p>

          <p className="mt-1 text-xs text-gray-500">
            {pendingOrders.length} pending · {declinedOrders.length} declined
          </p>
        </div>
      </div>

      {/* Payment methods */}
      <section className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900">
            Payment methods
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Revenue grouped by how clients paid.
          </p>
        </div>

        <div className="grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <CreditCard className="h-5 w-5 text-gray-500" />

              <div>
                <p className="text-sm font-medium text-gray-900">
                  Stripe
                </p>

                <p className="text-xs text-gray-500">
                  {stripeOrders.length} payment
                  {stripeOrders.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <p className="font-semibold text-gray-900">
              {currency.format(stripeRevenue)}
            </p>
          </div>

          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <Banknote className="h-5 w-5 text-gray-500" />

              <div>
                <p className="text-sm font-medium text-gray-900">
                  Cash
                </p>

                <p className="text-xs text-gray-500">
                  {cashOrders.length} payment
                  {cashOrders.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <p className="font-semibold text-gray-900">
              {currency.format(cashRevenue)}
            </p>
          </div>

          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 text-gray-500" />

              <div>
                <p className="text-sm font-medium text-gray-900">
                  Check
                </p>

                <p className="text-xs text-gray-500">
                  {checkOrders.length} payment
                  {checkOrders.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <p className="font-semibold text-gray-900">
              {currency.format(checkRevenue)}
            </p>
          </div>

          <div className="flex items-center justify-between p-5">
            <div className="flex items-center gap-3">
              <FileCheck2 className="h-5 w-5 text-gray-500" />

              <div>
                <p className="text-sm font-medium text-gray-900">
                  Financing
                </p>

                <p className="text-xs text-gray-500">
                  {financedOrders.length} payment
                  {financedOrders.length === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <p className="font-semibold text-gray-900">
              {currency.format(financedRevenue)}
            </p>
          </div>
        </div>
      </section>

      {/* TradeLock fees */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
            <DollarSign className="h-5 w-5" />
          </div>

          <div>
            <h2 className="font-semibold text-gray-900">
              TradeLock platform fees
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Platform fees recorded from completed Stripe payments.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between border-t border-gray-100 pt-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Recorded application fees
            </p>

            <p className="mt-1 text-2xl font-bold text-gray-900">
              {currency.format(stripeApplicationFees)}
            </p>
          </div>

          <p className="max-w-xs text-right text-xs text-gray-500">
            This reflects the application fee recorded by Stripe for
            completed payments. Stripe processing fees are separate.
          </p>
        </div>
      </section>

      {/* Average review — Pro+ (same financialReports gate as this whole page) */}
      {avgRating !== null && (
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Star className="h-5 w-5" />
            </div>
            <span className="text-sm font-medium text-gray-600">Average client review</span>
          </div>
          <p className="mt-4 text-2xl font-bold text-gray-900">{avgRating.toFixed(1)} / 5</p>
          <p className="mt-1 text-xs text-gray-500">
            From {reviewList.length} review{reviewList.length === 1 ? "" : "s"}
          </p>
        </section>
      )}

      {/* Advanced reporting — Business only */}
      {canSeeAdvancedReporting ? (
        <>
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Monthly earnings</h2>
                <p className="text-xs text-gray-500">Revenue from the last 6 months you had a paid order.</p>
              </div>
            </div>
            {monthlyEarningsTrend.length === 0 ? (
              <p className="text-sm text-gray-500">No paid revenue yet.</p>
            ) : (
              <div className="space-y-2">
                {monthlyEarningsTrend.map((month) => (
                  <div key={month.label} className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-xs font-medium text-gray-600">{month.label}</span>
                    <div className="h-3 flex-1 rounded-full bg-gray-100">
                      <div
                        className="h-3 rounded-full bg-blue-600"
                        style={{ width: `${(month.totalCents / maxMonthlyCents) * 100}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs font-semibold text-gray-900">
                      {currency.format(month.totalCents / 100)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                  <Repeat className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-gray-600">Repeat clients</span>
              </div>
              <p className="mt-4 text-2xl font-bold text-gray-900">{repeatClientCount}</p>
              <p className="mt-1 text-xs text-gray-500">
                Clients with more than one project with you
              </p>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50 text-green-700">
                  <Clock3 className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium text-gray-600">Avg. response time</span>
              </div>
              <p className="mt-4 text-2xl font-bold text-gray-900">
                {avgResponseHours === null
                  ? "—"
                  : avgResponseHours < 24
                    ? `${avgResponseHours.toFixed(1)}h`
                    : `${(avgResponseHours / 24).toFixed(1)}d`}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                From client signature to your countersignature
              </p>
            </section>
          </div>
        </>
      ) : (
        <section className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-gray-900 text-white">
            <TrendingUp className="h-5 w-5" />
          </div>
          <h2 className="mt-3 text-sm font-semibold text-gray-900">
            Monthly trends, repeat clients &amp; response time are a Business feature
          </h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gray-500">
            Upgrade to Business to see deeper performance analytics.
          </p>
          <Link
            href="/dashboard/billing"
            className="mt-3 inline-block rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-gray-800"
          >
            View Business plan
          </Link>
        </section>
      )}
    </div>
  );
}