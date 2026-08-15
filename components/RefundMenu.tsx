import { MoreHorizontal, Undo2 } from "lucide-react";
import { refundChangeOrder } from "@/app/(dashboard)/dashboard/actions";

const inputClass =
  "mx-2 block w-[calc(100%-1rem)] rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

const confirmButtonClass =
  "mx-2 mb-1.5 w-[calc(100%-1rem)] rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700";

// Native <details>/<summary> dropdown, same pattern as OfflinePaymentMenu —
// no client JS needed. Leaving the amount field blank refunds the full
// remaining balance; refundChangeOrder re-validates the amount and
// ownership server-side regardless of what this menu shows.
export default function RefundMenu({
  changeOrderId,
  remainingCents,
}: {
  changeOrderId: string;
  remainingCents: number;
}) {
  const remainingDollars = (remainingCents / 100).toFixed(2);

  return (
    <details className="relative">
      <summary
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-gray-200 text-gray-900 hover:bg-gray-50 hover:text-gray-900 [&::-webkit-details-marker]:hidden"
        aria-label="Refund this payment"
      >
        <Undo2 className="h-4 w-4" />
      </summary>

      <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
        <form action={refundChangeOrder}>
          <input type="hidden" name="changeOrderId" value={changeOrderId} />
          <div className="flex items-center gap-2 px-3 pb-1.5 text-sm font-medium text-gray-900">
            <MoreHorizontal className="h-4 w-4 text-red-600" />
            Refund up to ${remainingDollars}
          </div>
          <input
            type="number"
            name="amount"
            min="0.01"
            step="0.01"
            max={remainingDollars}
            placeholder={`Full refund ($${remainingDollars})`}
            className={inputClass}
          />
          <button type="submit" className={`mt-1.5 ${confirmButtonClass}`}>
            Confirm refund
          </button>
        </form>
      </div>
    </details>
  );
}
