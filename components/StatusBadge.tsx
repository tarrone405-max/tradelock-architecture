import {
  Banknote,
  CheckCircle2,
  Circle,
  CircleDollarSign,
  Clock,
  Landmark,
  Receipt,
  XCircle,
} from "lucide-react";

// Status colors are reserved and always paired with an icon + label — never
// color alone. "none" covers projects with no change orders yet. cash/check
// mirror "paid"'s blue (money in hand, just not through Stripe); "financed"
// gets its own tone since it means "lender approved," not necessarily
// "cash received yet."
const CONFIG: Record<string, { style: string; label: string; icon: typeof Circle }> = {
  pending: { style: "bg-amber-50 text-amber-700 ring-amber-600/20", label: "Pending", icon: Clock },
  approved: {
    style: "bg-green-50 text-green-700 ring-green-600/20",
    label: "Approved",
    icon: CheckCircle2,
  },
  declined: { style: "bg-red-50 text-red-700 ring-red-600/20", label: "Declined", icon: XCircle },
  paid: {
    style: "bg-blue-50 text-blue-700 ring-blue-600/20",
    label: "Paid",
    icon: CircleDollarSign,
  },
  cash: {
    style: "bg-blue-50 text-blue-700 ring-blue-600/20",
    label: "Paid via Cash",
    icon: Banknote,
  },
  check: {
    style: "bg-blue-50 text-blue-700 ring-blue-600/20",
    label: "Paid via Check",
    icon: Receipt,
  },
  financed: {
    style: "bg-violet-50 text-violet-700 ring-violet-600/20",
    label: "Financed / Lender Approved",
    icon: Landmark,
  },
  none: { style: "bg-gray-100 text-gray-900 ring-gray-500/10", label: "No activity", icon: Circle },
};

export default function StatusBadge({ status }: { status: string }) {
  const { style, label, icon: Icon } = CONFIG[status] ?? CONFIG.none;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}
