import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/supabase";

// Session-aware Supabase client for Server Components / Server Actions.
// Reads the caller's auth cookies, so queries run as that user and are
// subject to their RLS policies (unlike lib/supabase/admin.ts).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component with no response to attach
            // cookies to — safe to ignore as long as session refresh is
            // also handled in middleware.
          }
        },
      },
    }
  );
}
