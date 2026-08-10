import "server-only";
import { Resend } from "resend";
import type { ReactNode } from "react";

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "TradeLock <onboarding@resend.dev>";

let resendClient: Resend | undefined;

// Lazy singleton, same reasoning as lib/stripe.ts / lib/supabase/admin.ts —
// `next build` imports modules that reference this without ever calling
// sendEmail(), so an eager throw on a missing key would fail the build.
function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendEmail({
  to,
  subject,
  react,
}: {
  to: string;
  subject: string;
  react: ReactNode;
}) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email:dev] Skipping send (no RESEND_API_KEY) — to=${to} subject="${subject}"`);
    return;
  }

  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    react,
  });

  if (error) {
    // Notifications are a side effect of signing, not a precondition for
    // it — callers should log and move on rather than fail the signature.
    console.error(`Failed to send email to ${to}:`, error.message);
  }
}
