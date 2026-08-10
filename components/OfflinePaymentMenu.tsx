import { Banknote, Landmark, MoreHorizontal, Receipt } from "lucide-react";
import { recordOfflinePayment } from "@/app/(dashboard)/dashboard/actions";

const referenceInputClass =
  "mx-2 block w-[calc(100%-1rem)] rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-900 placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

const confirmButtonClass =
  "mx-2 mb-1.5 w-[calc(100%-1rem)] rounded-md bg-gray-900 px-2 py-1 text-xs font-semibold text-white hover:bg-gray-800";

// Native <details>/<summary> dropdown — no client JS needed, each option is
// just a <form action={recordOfflinePayment}>. Only rendered for change
// orders still in "pending" or "approved" (the action itself also enforces
// this, so this is a UX nicety, not the security boundary).
export default function OfflinePaymentMenu({ changeOrderId }: { changeOrderId: string }) {
  return (
    <details className="relative">
      <summary
        className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-md border border-gray-200 text-gray-900 hover:bg-gray-50 hover:text-gray-900 [&::-webkit-details-marker]:hidden"
        aria-label="Record an offline payment"
      >
        <MoreHorizontal className="h-4 w-4" />
      </summary>

      <div className="absolute right-0 z-10 mt-1 w-64 space-y-1.5 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
        <form action={recordOfflinePayment}>
          <input type="hidden" name="changeOrderId" value={changeOrderId} />
          <input type="hidden" name="method" value="cash" />
          <button
            type="submit"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            <Banknote className="h-4 w-4 text-green-600" />
            Mark Paid (Cash)
          </button>
        </form>

        <form action={recordOfflinePayment} className="border-t border-gray-100 pt-1.5">
          <input type="hidden" name="changeOrderId" value={changeOrderId} />
          <input type="hidden" name="method" value="check" />
          <div className="flex items-center gap-2 px-3 pb-1.5 text-sm font-medium text-gray-900">
            <Receipt className="h-4 w-4 text-green-600" />
            Mark Paid (Check)
          </div>
          <input type="text" name="reference" placeholder="Check # (optional)" className={referenceInputClass} />
          <button type="submit" className={`mt-1.5 ${confirmButtonClass}`}>
            Confirm
          </button>
        </form>

        <form action={recordOfflinePayment} className="border-t border-gray-100 pt-1.5">
          <input type="hidden" name="changeOrderId" value={changeOrderId} />
          <input type="hidden" name="method" value="financed" />
          <div className="flex items-center gap-2 px-3 pb-1.5 text-sm font-medium text-gray-900">
            <Landmark className="h-4 w-4 text-violet-600" />
            Mark as Financed
          </div>
          <input
            type="text"
            name="reference"
            placeholder="Lender name (optional)"
            className={referenceInputClass}
          />
          <button type="submit" className={`mt-1.5 ${confirmButtonClass}`}>
            Confirm
          </button>
        </form>
      </div>
    </details>
  );
}
