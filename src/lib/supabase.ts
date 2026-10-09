import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

/** Server-side client met de service role key. Nooit naar de browser sturen. */
export function db(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY is niet ingesteld");
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}
