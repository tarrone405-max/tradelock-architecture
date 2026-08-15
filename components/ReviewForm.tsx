"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { submitReview } from "@/app/p/[token]/actions";
import type { FeedbackActionState } from "@/components/FeedbackForm";

const initialState: FeedbackActionState = { error: null, success: false };

// The star picker used to rely on Tailwind's peer-checked variant, which
// only styles the exact radio that's checked — not the stars before it, so
// picking "4 stars" only lit up the 4th star instead of 1 through 4. Real
// state fixes that cleanly instead of relying on sibling-selector CSS.
export default function ReviewForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(submitReview, initialState);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="rating" value={rating} />

      <div className="flex items-center gap-1" onMouseLeave={() => setHoverRating(0)}>
        {[1, 2, 3, 4, 5].map((value) => {
          const filled = value <= (hoverRating || rating);
          return (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              onMouseEnter={() => setHoverRating(value)}
              aria-label={`${value} star${value === 1 ? "" : "s"}`}
              className="cursor-pointer"
            >
              <Star
                className={`h-6 w-6 ${
                  filled ? "fill-amber-400 text-amber-400" : "text-gray-300"
                }`}
              />
            </button>
          );
        })}
      </div>

      <textarea
        name="comment"
        rows={2}
        maxLength={2000}
        placeholder="Add a comment (optional)"
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
      />

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}
      {state.success && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-600">
          Thanks for the review!
        </p>
      )}

      <button
        type="submit"
        disabled={pending || rating === 0}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit review"}
      </button>
    </form>
  );
}
