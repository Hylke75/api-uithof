import { createCashClient } from "@/lib/cash/client";
import { env } from "@/lib/env";
import { createSemClient } from "@/lib/sem/client";
import { db } from "@/lib/supabase";
import { runSync } from "./run";
import { supabaseStore } from "./store";

/** Start een sync met de productieconfiguratie uit de omgevingsvariabelen. */
export function startSync(trigger: "cron" | "handmatig") {
  const e = env();
  return runSync({
    store: supabaseStore(db()),
    sem: createSemClient({ baseUrl: e.SEM_BASE_URL, apiKey: e.SEM_API_KEY }),
    cash: createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY }),
    dryRun: e.SYNC_DRY_RUN,
    startDate: e.SYNC_START_DATE,
    cashInstellingen: {
      administratie: e.CASH_ADMINISTRATIE,
      dagboek: e.CASH_DAGBOEK,
      debiteurenGrootboek: e.CASH_GB_DEBITEUREN,
    },
    trigger,
  });
}
