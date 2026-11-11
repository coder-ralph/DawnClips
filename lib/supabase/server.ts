import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/**
 * While Next.js prerenders the static shell there is no request, so auth() waits for one and is rejected
 * with this digest when the prerender ends. Nothing can be authenticated at that point.
 */
function isPrerenderAbort(error: unknown) {
  return typeof error === "object" && error !== null && (error as { digest?: unknown }).digest === "HANGING_PROMISE_REJECTION";
}

export function createServerSupabaseClient() {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    accessToken: async () => {
      try {
        return await (await auth()).getToken();
      } catch (error) {
        // supabase-js asks for a token as soon as the client is created. During prerendering that call can
        // never be answered, so it stays pending (the prerender discards it) instead of logging a build error.
        if (isPrerenderAbort(error)) return new Promise<never>(() => {});
        throw error;
      }
    },
  });
}
