"use client";

import { useActionState, useEffect, useRef } from "react";

export type FeedbackActionState = { error: string | null; success: boolean };

const initialState: FeedbackActionState = { error: null, success: false };

const fieldClass =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

// Shared by the dashboard (provider) and the client portal — same shape as
// MessageThread: the caller passes in the action and whatever hidden fields
// it needs to identify who's submitting (userId is implicit server-side for
// the provider; token for the client).
export default function FeedbackForm({
  action,
  hiddenFields,
}: {
  action: (prevState: FeedbackActionState, formData: FormData) => Promise<FeedbackActionState>;
  hiddenFields?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
    }
  }, [state.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      {hiddenFields &&
        Object.entries(hiddenFields).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}

      <div>
        <label className="block text-sm font-medium text-gray-900">What&rsquo;s this about?</label>
        <select name="feedbackType" required defaultValue="bug" className={fieldClass}>
          <option value="bug">Report a bug</option>
          <option value="suggestion">Suggest an improvement</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900">Details</label>
        <textarea
          name="message"
          required
          rows={4}
          maxLength={4000}
          placeholder="What happened, or what would make this better?"
          className={fieldClass}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900">
          Your email <span className="font-normal text-gray-500">(optional, if you&rsquo;d like a reply)</span>
        </label>
        <input type="email" name="contactEmail" className={fieldClass} />
      </div>

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-600">
          Thanks — this has been sent.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send feedback"}
      </button>
    </form>
  );
}
