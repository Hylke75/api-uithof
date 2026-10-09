import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { leesEnv } from "./env";

let client: SupabaseClient | undefined;

/** Server-side client met de service role key. Nooit naar de browser sturen. */
export function db(): SupabaseClient {
  // Accepteer ook de REST-URL uit het dashboard (…supabase.co/rest/v1/).
  const url = leesEnv("SUPABASE_URL")?.replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  const key = leesEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY is niet ingesteld");
  client ??= createClient(url, key, { auth: { persistSession: false } });
  return client;
}
