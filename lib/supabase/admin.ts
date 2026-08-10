import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

let adminClient: SupabaseClient<Database> | undefined;

// Bypasses Row Level Security entirely — only for trusted server-only
// code (Stripe webhook handler, billing Server Actions). Lazily built for
// the same reason as lib/stripe.ts: `next build` imports route handlers
// without invoking them, so an eager throw here would fail the build.
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (!adminClient) {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
    }
    adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }
  return adminClient;
}
