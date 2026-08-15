import { notFound } from "next/navigation";
import { AlertTriangle, Download, Lock, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import {
  revokePortalLink,
  rotatePortalLink,
  sendProviderMessage,
} from "../../actions";
import { getUserPlan } from "@/lib/planAccess";
import StatusBadge from "@/components/StatusBadge";
import ExecutionStatusBadge from "@/components/ExecutionStatusBadge";
import OfflinePaymentMenu from "@/components/OfflinePaymentMenu";
import RefundMenu from "@/components/RefundMenu";
import CountersignForm from "@/components/CountersignForm";
import NewChangeOrderForm from "@/components/NewChangeOrderForm";
import MessageThread from "@/components/MessageThread";
import AuditLogTimeline from "@/components/AuditLogTimeline";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be signed in.");
  }

  const plan = await getUserPlan(user.id);

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_name, property_address, unique_token, portal_token_revoked_at")
    .eq("id", id)
    .maybeSingle();

  if (!project) {
    notFound();
  }

  const [{ data: changeOrders }, { data: messages }, { data: review }] = await Promise.all([
    supabase
      .from("change_orders")
      .select(
        "id, description, cost, status, created_at, due_date, client_signed_at, provider_signed_at, stripe_payment_intent_id, refunded_amount, refunded_at, dispute_status, disputed_at, paid_at"
      )
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("messages")
      .select("id, sender_type, body, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("reviews")
      .select("rating, comment, created_at")
      .eq("project_id", project.id)
      .maybeSingle(),
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const portalUrl = `${siteUrl}/p/${project.unique_token}`;
  const portalRevoked = !!project.portal_token_revoked_at;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{project.client_name}</h1>
        {project.property_address && (
          <p className="text-sm text-gray-900">{project.property_address}</p>
        )}
        {portalRevoked ? (
          <p className="mt-2 rounded-md bg-red-50 p-2 text-xs font-medium text-red-700">
            Portal link revoked — your client can no longer view this project.
          </p>
        ) : (
          <p className="mt-2 break-all rounded-md bg-gray-100 p-2 text-xs font-medium text-gray-900">
            {portalUrl}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3">
          <form action={rotatePortalLink}>
            <input type="hidden" name="projectId" value={project.id} />
            <button
              type="submit"
              className="text-xs font-medium text-gray-900 underline underline-offset-2 hover:text-gray-700"
            >
              {portalRevoked ? "Generate new link" : "Rotate link"}
            </button>
          </form>
          {!portalRevoked && (
            <form action={revokePortalLink}>
              <input type="hidden" name="projectId" value={project.id} />
              <button
                type="submit"
                className="text-xs font-medium text-red-600 underline underline-offset-2 hover:text-red-700"
              >
                Revoke link
              </button>
            </form>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">New change order</h2>
        <NewChangeOrderForm projectId={project.id} />
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Change orders</h2>
        {!changeOrders || changeOrders.length === 0 ? (
          <p className="text-sm text-gray-900">No change orders yet.</p>
        ) : (
          <ul className="space-y-3">
            {changeOrders.map((co) => {
              // Matches the settlement rule enforced server-side in
              // recordOfflinePayment: both signatures must be in before an
              // offline payment can be recorded.
              const canRecordPayment =
                co.status === "approved" && !!co.client_signed_at && !!co.provider_signed_at;
              const hasRecord = co.status !== "pending";
              const showExecutionStatus = co.status !== "declined";
              const needsCountersign = !!co.client_signed_at && !co.provider_signed_at;

              const costCents = Math.round(Number(co.cost) * 100);
              const refundedCents = co.refunded_amount ?? 0;
              const remainingCents = costCents - refundedCents;
              // Refunds are a Pro+ capability (lib/plans.ts's
              // advancedPayments flag) — Free providers see a locked hint
              // instead of the action and have to go through Stripe support
              // directly for now.
              const canRefund =
                plan.features.advancedPayments &&
                co.status === "paid" &&
                !!co.stripe_payment_intent_id &&
                remainingCents > 0;
              const refundLocked =
                !plan.features.advancedPayments &&
                co.status === "paid" &&
                !!co.stripe_payment_intent_id &&
                remainingCents > 0;

              return (
                <li key={co.id} className="rounded-lg border bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-900">{co.description}</p>
                    <div className="flex flex-col items-end gap-1">
                      <StatusBadge status={co.status} />
                      {showExecutionStatus && (
                        <ExecutionStatusBadge
                          clientSignedAt={co.client_signed_at}
                          providerSignedAt={co.provider_signed_at}
                        />
                      )}
                    </div>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        ${Number(co.cost).toFixed(2)}
                      </p>
                      {refundedCents > 0 && (
                        <p className="text-xs text-gray-500">
                          ${(refundedCents / 100).toFixed(2)} refunded
                        </p>
                      )}
                      {co.due_date && (
                        <p className="text-xs text-gray-500">
                          Due {new Date(co.due_date + "T00:00:00").toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {hasRecord && (
                        <a
                          href={`/api/pdf/change-order/${co.id}`}
                          className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      )}
                      {canRecordPayment && <OfflinePaymentMenu changeOrderId={co.id} />}
                      {canRefund && (
                        <RefundMenu changeOrderId={co.id} remainingCents={remainingCents} />
                      )}
                      {refundLocked && (
                        <span
                          title="Refunds are a Pro feature — upgrade to issue refunds from TradeLock."
                          className="flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 text-gray-400"
                        >
                          <Lock className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                  {co.dispute_status && (
                    <div className="mt-2 flex items-center gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Payment disputed with the bank — status: {co.dispute_status.replaceAll("_", " ")}
                    </div>
                  )}
                  {needsCountersign && <CountersignForm changeOrderId={co.id} />}
                  {plan.features.auditLogs && hasRecord && (
                    <AuditLogTimeline
                      events={[
                        { label: "Created", at: co.created_at },
                        { label: "Client signed", at: co.client_signed_at },
                        { label: "Provider countersigned", at: co.provider_signed_at },
                        { label: "Paid", at: co.paid_at },
                        { label: "Disputed", at: co.disputed_at },
                        { label: "Refunded", at: co.refunded_at },
                      ]}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {review && (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Star className="h-4 w-4 text-amber-500" />
            Client review
          </h2>
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={index}
                className={`h-4 w-4 ${
                  index < review.rating ? "fill-amber-400 text-amber-400" : "text-gray-200"
                }`}
              />
            ))}
          </div>
          {review.comment && <p className="mt-2 text-sm text-gray-900">{review.comment}</p>}
          <p className="mt-1 text-xs text-gray-500">
            {new Date(review.created_at).toLocaleDateString()}
          </p>
        </section>
      )}

      <MessageThread
        messages={messages ?? []}
        viewerType="provider"
        action={sendProviderMessage}
        hiddenFields={{ projectId: project.id }}
      />
    </div>
  );
}
