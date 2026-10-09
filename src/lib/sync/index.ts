import { createCashClient } from "@/lib/cash/client";
import { env } from "@/lib/env";
import { createSemClient } from "@/lib/sem/client";
import { db } from "@/lib/supabase";
import { runSync } from "./run";
import { laadInstellingen, supabaseStore } from "./store";

/** Start een sync met de productieconfiguratie uit de omgevingsvariabelen. */
export async function startSync(trigger: "cron" | "handmatig") {
  const e = env();
  // Een omgevingsvariabele in Vercel gaat voor; anders de waarde uit de tabel `instellingen`.
  const inst = await laadInstellingen(db());
  return runSync({
    store: supabaseStore(db()),
    sem: createSemClient({ baseUrl: e.SEM_BASE_URL, apiKey: e.SEM_API_KEY }),
    cash: createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY }),
    dryRun: e.SYNC_DRY_RUN,
    startDate: e.SYNC_START_DATE,
    cashInstellingen: {
      administratie: e.CASH_ADMINISTRATIE,
      dagboek: e.CASH_DAGBOEK || inst.cash_dagboek || "",
      debiteurenGrootboek: e.CASH_GB_DEBITEUREN || inst.cash_gb_debiteuren || "",
    },
    trigger,
  });
}
