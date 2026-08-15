import { MessageSquareWarning } from "lucide-react";
import { submitFeedback } from "../actions";
import FeedbackForm from "@/components/FeedbackForm";

export default function FeedbackPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white">
            <MessageSquareWarning className="h-4 w-4" />
          </div>

          <div>
            <h1 className="text-sm font-semibold text-gray-900">Feedback</h1>
            <p className="text-xs font-medium text-gray-900">
              Report a bug or suggest an improvement — this goes straight to the TradeLock team.
            </p>
          </div>
        </div>

        <FeedbackForm action={submitFeedback} />
      </section>
    </div>
  );
}
