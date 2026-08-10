import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { Database } from "@/types/supabase";

// Checks whether this event id has already been fully processed. Only ever
// called after signature verification — an unverified payload must never
// influence this table. IMPORTANT: this only checks; the caller must still
// run its handler and call markWebhookEventProcessed() itself afterward —
// recording the id up front (before processing) would mean a mid-handler
// failure gets permanently mistaken for success on Stripe's retry, since
// the retry would see the id already recorded and skip reprocessing a
// payment/subscription/Connect update that never actually completed.
export async function hasProcessedWebhookEvent(
  supabaseAdmin: SupabaseClient<Database>,
  eventId: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("stripe_webhook_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    // Fail open: if we can't tell whether it was already processed, treat
    // it as new rather than silently dropping a real event. Every handler
    // that follows has its own status/out-of-order guards as a backstop
    // against reprocessing being applied twice.
    console.error(`Failed to check webhook event ${eventId} idempotency status:`, error.message);
    return false;
  }

  return !!data;
}

// Records an event id as fully processed — call this ONLY after every
// required database write for that event has already succeeded. A failure
// here doesn't undo the processing that already happened, so it's logged
// rather than thrown: worst case, a future duplicate delivery redoes
// already-safe (status-guarded) work instead of being skipped.
export async function markWebhookEventProcessed(
  supabaseAdmin: SupabaseClient<Database>,
  event: Stripe.Event,
  endpoint: "platform" | "connect"
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("stripe_webhook_events")
    .insert({ id: event.id, type: event.type, endpoint });

  // 23505 = unique_violation — a concurrent duplicate delivery already
  // recorded it first. That's fine, not an error.
  if (error && error.code !== "23505") {
    console.error(`Failed to record webhook event ${event.id} as processed:`, error.message);
  }
}
