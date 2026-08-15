"use client";

import { useActionState } from "react";
import { createChangeOrder, type FormActionState } from "@/app/(dashboard)/dashboard/actions";
import BackButton from "@/components/BackButton";

const inputClass =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

const initialState: FormActionState = { error: null };

export default function NewChangeOrderForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createChangeOrder, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border bg-white p-4">
      <input type="hidden" name="projectId" value={projectId} />
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

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <div className="flex items-center justify-between pt-4">
        <BackButton />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-md border border-transparent bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50"
        >
          {pending ? "Confirming…" : "Confirm change order"}
        </button>
      </div>
    </form>
  );
}
