import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    [
      "Supabase env is missing.",
      "Set these in dashboard/.env.local (or Vercel env vars):",
      "- NEXT_PUBLIC_SUPABASE_URL",
      "- NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ].join("\n")
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

