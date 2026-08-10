import { countersignChangeOrder } from "@/app/(dashboard)/dashboard/actions";

export default function CountersignForm({ changeOrderId }: { changeOrderId: string }) {
  return (
    <form
      action={countersignChangeOrder}
      className="mt-3 flex items-center gap-2 border-t border-gray-100 pt-3"
    >
      <input type="hidden" name="changeOrderId" value={changeOrderId} />
      <input
        type="text"
        name="providerName"
        required
        placeholder="Your name"
        className="block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
      />
      <button
        type="submit"
        className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
      >
        Countersign
      </button>
    </form>
  );
}
