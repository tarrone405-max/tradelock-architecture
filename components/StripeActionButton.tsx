"use client";

import { useActionState } from "react";
import type { ConnectActionState } from "@/app/actions/connect";

const initialState: ConnectActionState = { error: null };

// Wraps a single-button Server Action (Connect onboarding, opening the
// Express dashboard) with useActionState so a Stripe API failure shows an
// inline message instead of crashing the whole settings page.
export default function StripeActionButton({
  action,
  label,
  pendingLabel,
  className,
}: {
  action: (
    prevState: ConnectActionState,
    formData: FormData
  ) => Promise<ConnectActionState>;
  label: string;
  pendingLabel: string;
  className: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction}>
      <button type="submit" disabled={pending} className={className}>
        {pending ? pendingLabel : label}
      </button>
      {state.error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {state.error}
        </p>
      )}
    </form>
  );
}
