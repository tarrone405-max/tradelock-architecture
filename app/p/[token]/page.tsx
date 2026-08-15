import { notFound } from "next/navigation";
import {
  CheckCircle2,
  Download,
  Star,
  XCircle,
} from "lucide-react";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getUserPlan } from "@/lib/planAccess";

import StatusBadge from "@/components/StatusBadge";
import ExecutionStatusBadge from "@/components/ExecutionStatusBadge";
import SignaturePad from "@/components/SignaturePad";
import MessageThread from "@/components/MessageThread";
import FeedbackForm from "@/components/FeedbackForm";
import ReviewForm from "@/components/ReviewForm";

import {
  signChangeOrder,
  declineChangeOrder,
  payChangeOrder,
  sendClientMessage,
  submitClientFeedback,
} from "./actions";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export default async function ClientPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { token } = await params;
  const { payment } = await searchParams;

  const supabaseAdmin = getSupabaseAdmin();

  // ============================================================
  // LOAD PROJECT
  // ============================================================

  const { data: project } = await supabaseAdmin
    .from("projects")
    .select(
      `
        id,
        client_name,
        property_address,
        user_id,
        portal_token_revoked_at,
        users(
          company_name,
          stripe_connect_charges_enabled
        )
      `
    )
    .eq("unique_token", token)
    .maybeSingle();

  if (!project) {
    notFound();
  }

  // ============================================================
  // REVOKED PORTAL
  // ============================================================

  if (project.portal_token_revoked_at) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 text-center">
          <h1 className="text-lg font-semibold text-gray-900">
            This link is no longer active
          </h1>

          <p className="mt-2 text-sm text-gray-900">
            Please contact your contractor for an updated link.
          </p>
        </div>
      </div>
    );
  }

  // ============================================================
  // LOAD CHANGE ORDERS + TERMS
  // ============================================================

  const [
    { data: changeOrders },
    { data: activeTerms },
    { data: messages },
    { data: review },
  ] = await Promise.all([
      supabaseAdmin
        .from("change_orders")
        .select(
          `
            id,
            description,
            cost,
            status,
            created_at,
            due_date,
            client_signed_at,
            provider_signed_at
          `
        )
        .eq("project_id", project.id)
        .order("created_at", {
          ascending: false,
        }),

      supabaseAdmin
        .from("terms_of_service")
        .select("id, version, content")
        .eq("user_id", project.user_id)
        .eq("is_active", true)
        .maybeSingle(),

      supabaseAdmin
        .from("messages")
        .select("id, sender_type, body, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: true }),

      supabaseAdmin
        .from("reviews")
        .select("id")
        .eq("project_id", project.id)
        .maybeSingle(),
    ]);

  const orders = changeOrders ?? [];

  const companyName =
    project.users?.company_name ?? null;

  // At least one paid change order and no review yet -> eligible to leave one.
  const canReview =
    !review && orders.some((order) => order.status === "paid");

  // Pro+ providers can remove TradeLock's own footer branding from the
  // portal their clients see (lib/plans.ts's removeTradeLockBranding flag).
  const plan = await getUserPlan(project.user_id);
  const showTradeLockBranding = !plan.features.removeTradeLockBranding;

  const providerAcceptsPayments =
    !!project.users?.stripe_connect_charges_enabled;

  // ============================================================
  // PAYMENT SUCCESS STATE
  // ============================================================

  const hasPaidOrder = orders.some(
    (order) => order.status === "paid"
  );

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg space-y-6">

        {/* ====================================================== */}
        {/* HEADER */}
        {/* ====================================================== */}

        <div className="text-center">
          {companyName && (
            <p className="text-sm font-medium text-gray-900">
              {companyName}
            </p>
          )}

          <h1 className="text-xl font-semibold text-gray-900">
            {project.client_name}
          </h1>

          {project.property_address && (
            <p className="text-sm text-gray-900">
              {project.property_address}
            </p>
          )}
        </div>

        {/* ====================================================== */}
        {/* PAYMENT SUCCESS */}
        {/* ====================================================== */}

        {payment === "success" && hasPaidOrder && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />

            <span>
              Payment received — thank you!
            </span>
          </div>
        )}

        {/* ====================================================== */}
        {/* PAYMENT PROCESSING */}
        {/* ====================================================== */}

        {payment === "success" && !hasPaidOrder && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />

            <span>
              Your payment was submitted successfully.
              We&rsquo;re confirming it now.
            </span>
          </div>
        )}

        {/* ====================================================== */}
        {/* PAYMENT CANCELLED */}
        {/* ====================================================== */}

        {payment === "cancelled" && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <XCircle className="h-4 w-4 shrink-0" />

            <span>
              Payment was cancelled. You can try again below.
            </span>
          </div>
        )}

        {/* ====================================================== */}
        {/* TERMS OF SERVICE */}
        {/* ====================================================== */}

        {activeTerms && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">
              Terms of Service
            </h2>

            <p className="mt-0.5 text-xs text-gray-900">
              Version {activeTerms.version}
            </p>

            <div className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-xs text-gray-900">
              {activeTerms.content}
            </div>
          </div>
        )}

        {/* ====================================================== */}
        {/* CHANGE ORDERS */}
        {/* ====================================================== */}

        {orders.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <p className="text-sm text-gray-900">
              No change orders yet. Your contractor will add these here as extra work comes up.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {orders.map((co) => {
              const hasApprovalRecord =
                co.status !== "pending" &&
                co.status !== "declined";

              const isPending =
                co.status === "pending";

              const isApproved =
                co.status === "approved";

              const isPaid =
                co.status === "paid";

              return (
                <li
                  key={co.id}
                  className="rounded-xl border border-gray-200 bg-white p-5"
                >

                  {/* ================================================== */}
                  {/* CHANGE ORDER HEADER */}
                  {/* ================================================== */}

                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-900">
                      {co.description}
                    </p>

                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={co.status} />

                      {co.status !== "declined" && (
                        <ExecutionStatusBadge
                          clientSignedAt={
                            co.client_signed_at
                          }
                          providerSignedAt={
                            co.provider_signed_at
                          }
                        />
                      )}
                    </div>
                  </div>

                  {/* ================================================== */}
                  {/* PRICE + PDF */}
                  {/* ================================================== */}

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-gray-900">
                        {currency.format(
                          Number(co.cost)
                        )}
                      </p>

                      {co.due_date && (
                        <p className="text-xs text-gray-500">
                          Due{" "}
                          {new Date(
                            co.due_date +
                              "T00:00:00"
                          ).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    {hasApprovalRecord && (
                      <a
                        href={`/api/pdf/change-order/${co.id}?token=${token}`}
                        className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download PDF
                      </a>
                    )}
                  </div>

                  {/* ================================================== */}
                  {/* PENDING CHANGE ORDER */}
                  {/* ================================================== */}

                  {isPending && (
                    <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                      <SignaturePad
                        changeOrderId={co.id}
                        token={token}
                        action={signChangeOrder}
                        termsVersionId={
                          activeTerms?.id ?? null
                        }
                      />

                      <form
                        action={declineChangeOrder}
                        className="text-center"
                      >
                        <input
                          type="hidden"
                          name="token"
                          value={token}
                        />

                        <input
                          type="hidden"
                          name="changeOrderId"
                          value={co.id}
                        />

                        <button
                          type="submit"
                          className="text-xs font-medium text-gray-900 hover:text-red-600"
                        >
                          Decline this change order
                        </button>
                      </form>
                    </div>
                  )}

                  {/* ================================================== */}
                  {/* APPROVED CHANGE ORDER */}
                  {/* ================================================== */}

                  {isApproved && (
                    <div className="mt-4 border-t border-gray-100 pt-4">

                      {!co.provider_signed_at ? (
                        <p className="text-center text-xs text-gray-900">
                          Waiting on{" "}
                          {companyName ||
                            "your contractor"}{" "}
                          to countersign before payment can be collected.
                        </p>
                      ) : providerAcceptsPayments ? (
                        <form action={payChangeOrder}>
                          <input
                            type="hidden"
                            name="token"
                            value={token}
                          />

                          <input
                            type="hidden"
                            name="changeOrderId"
                            value={co.id}
                          />

                          <button
                            type="submit"
                            className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
                          >
                            Pay{" "}
                            {currency.format(
                              Number(co.cost)
                            )}
                          </button>
                        </form>
                      ) : (
                        <p className="text-center text-xs text-gray-900">
                          Online payment isn&rsquo;t set up yet — please contact{" "}
                          {companyName ||
                            "your contractor"}{" "}
                          directly to pay this change order.
                        </p>
                      )}

                    </div>
                  )}

                  {/* ================================================== */}
                  {/* PAID CHANGE ORDER */}
                  {/* ================================================== */}

                  {isPaid && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      <div className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />

                        <span>
                          Payment received
                        </span>
                      </div>

                      <p className="mt-2 text-center text-xs text-gray-500">
                        This change order has been paid in full.
                      </p>
                    </div>
                  )}

                </li>
              );
            })}
          </ul>
        )}

        {/* ====================================================== */}
        {/* LEAVE A REVIEW */}
        {/* ====================================================== */}

        {canReview && (
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
              <Star className="h-4 w-4 text-amber-500" />
              How was your experience with {companyName || "your contractor"}?
            </h2>
            <ReviewForm token={token} />
          </div>
        )}

        {/* ====================================================== */}
        {/* MESSAGES */}
        {/* ====================================================== */}

        <MessageThread
          messages={messages ?? []}
          viewerType="client"
          action={sendClientMessage}
          hiddenFields={{ token }}
        />

        {/* ====================================================== */}
        {/* FEEDBACK */}
        {/* ====================================================== */}

        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">Something not working?</h2>
          <p className="mb-3 text-xs text-gray-500">
            Report a bug or suggest an improvement to TradeLock — this goes to the TradeLock team,
            not to your contractor.
          </p>
          <FeedbackForm action={submitClientFeedback} hiddenFields={{ token }} />
        </section>

        {/* ====================================================== */}
        {/* FOOTER */}
        {/* ====================================================== */}

        {showTradeLockBranding && (
          <p className="text-center text-xs text-gray-900">
            Secured by TradeLock
          </p>
        )}

      </div>
    </div>
  );
}