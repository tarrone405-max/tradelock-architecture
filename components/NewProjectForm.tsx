"use client";

import { useActionState } from "react";
import { User, Mail, MapPin } from "lucide-react";
import { createProject, type FormActionState } from "@/app/(dashboard)/dashboard/actions";

const fieldClass =
  "block w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm transition-shadow placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10";

const initialState: FormActionState = { error: null };

export default function NewProjectForm() {
  const [state, formAction, pending] = useActionState(createProject, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-900">
          Client name
        </label>

        <div className="relative">
          <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />

          <input
            name="clientName"
            type="text"
            required
            placeholder="Jane Homeowner"
            className={fieldClass}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-900">
            Client email <span className="text-gray-900">(optional)</span>
          </label>

          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />

            <input
              name="clientEmail"
              type="email"
              placeholder="jane@email.com"
              className={fieldClass}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-900">
            Property address <span className="text-gray-900">(optional)</span>
          </label>

          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />

            <input
              name="propertyAddress"
              type="text"
              placeholder="123 Main St"
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
