import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createChangeOrder } from "../../actions";
import StatusBadge from "@/components/StatusBadge";
import ExecutionStatusBadge from "@/components/ExecutionStatusBadge";
import OfflinePaymentMenu from "@/components/OfflinePaymentMenu";
import CountersignForm from "@/components/CountersignForm";
import BackButton from "@/components/BackButton";

const inputClass =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_name, property_address, unique_token")
    .eq("id", id)
    .maybeSingle();

  if (!project) {
    notFound();
  }

  const { data: changeOrders } = await supabase
    .from("change_orders")
    .select(
      "id, description, cost, status, created_at, due_date, client_signed_at, provider_signed_at"
    )
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const portalUrl = `${siteUrl}/p/${project.unique_token}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{project.client_name}</h1>
        {project.property_address && (
          <p className="text-sm text-gray-900">{project.property_address}</p>
        )}
        <p className="mt-2 break-all rounded-md bg-gray-100 p-2 text-xs font-medium text-gray-900">
          {portalUrl}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">New change order</h2>
        <form action={createChangeOrder} className="space-y-3 rounded-lg border bg-white p-4">
          <input type="hidden" name="projectId" value={project.id} />
          <div>
            <label className="block text-sm font-medium text-gray-900">Description</label>
            <textarea name="description" required rows={3} className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900">Cost ($)</label>
            <input type="number" name="cost" min="0" step="0.01" required className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900">
              Payment due date <span className="text-gray-500">(optional)</span>
            </label>
            <input type="date" name="dueDate" className={inputClass} />
          </div>
          <div className="flex items-center justify-between pt-4">
            <BackButton />
            <button
              type="submit"
              className="inline-flex items-center rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
            >
              Confirm change order
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-gray-900">Change orders</h2>
        {!changeOrders || changeOrders.length === 0 ? (
          <p className="text-sm text-gray-900">No change orders yet.</p>
        ) : (
          <ul className="space-y-3">
            {changeOrders.map((co) => {
              const canRecordPayment = co.status === "pending" || co.status === "approved";
              const hasRecord = co.status !== "pending";
              const showExecutionStatus = co.status !== "declined";
              const needsCountersign = !!co.client_signed_at && !co.provider_signed_at;
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
                    </div>
                  </div>
                  {needsCountersign && <CountersignForm changeOrderId={co.id} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
