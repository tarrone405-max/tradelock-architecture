import { CheckCircle2, ClipboardCheck, PenTool } from "lucide-react";

// Derived, not stored — computed from client_signed_at/provider_signed_at
// at read time. This tracks signature *execution* progress, a different
// axis from the payment-lifecycle `status` column (StatusBadge) — a change
// order can be "Fully Executed" and still be unpaid, or "Pending Client
// Signature" and already marked cash if a provider bypassed the portal
// entirely, so the two badges intentionally coexist rather than merge.
export default function ExecutionStatusBadge({
  clientSignedAt,
  providerSignedAt,
}: {
  clientSignedAt: string | null;
  providerSignedAt: string | null;
}) {
  const config = !clientSignedAt
    ? {
        label: "Pending Client Signature",
        style: "bg-amber-50 text-amber-700 ring-amber-600/20",
        icon: PenTool,
      }
    : !providerSignedAt
      ? {
          label: "Pending Provider Review",
          style: "bg-violet-50 text-violet-700 ring-violet-600/20",
          icon: ClipboardCheck,
        }
      : {
          label: "Fully Executed",
          style: "bg-green-50 text-green-700 ring-green-600/20",
          icon: CheckCircle2,
        };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${config.style}`}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}
