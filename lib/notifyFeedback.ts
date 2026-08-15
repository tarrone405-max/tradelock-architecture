import "server-only";

import { sendEmail } from "@/lib/resend";
import NotificationEmail from "@/emails/NotificationEmail";

// Shared by both the provider (dashboard) and client (portal) feedback
// actions — the only difference between them is who's submitting, which the
// caller describes via `from`.
export async function notifyFeedbackReceived({
  feedbackType,
  message,
  contactEmail,
  from,
}: {
  feedbackType: "bug" | "suggestion";
  message: string;
  contactEmail: string | null;
  from: string;
}) {
  const to = process.env.FEEDBACK_NOTIFICATION_EMAIL;

  if (!to) {
    console.log("[feedback] Skipping notification email (no FEEDBACK_NOTIFICATION_EMAIL set)");
    return;
  }

  const label = feedbackType === "bug" ? "Bug report" : "Improvement suggestion";

  await sendEmail({
    to,
    subject: `TradeLock feedback: ${label} from ${from}`,
    react: NotificationEmail({
      preview: `${label} from ${from}`,
      heading: label,
      body: `From: ${from}${contactEmail ? ` (${contactEmail})` : ""}\n\n${message}`,
      footer: "Sent by TradeLock's feedback form.",
    }),
  });
}
