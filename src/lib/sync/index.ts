import { createCashClient } from "@/lib/cash/client";
import { env } from "@/lib/env";
import { createSemClient, type SemClient } from "@/lib/sem/client";
import { db } from "@/lib/supabase";
import { runSync } from "./run";
import { laadInstellingen, supabaseStore } from "./store";

/** De enige CASH-administratie waarin een testboeking is toegestaan. */
export const TEST_ADMINISTRATIE = "demo";

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
      kostenplaatsNegeren: inst.kostenplaatsen === "negeren",
    },
    trigger,
  });
}

/**
 * Echte testboeking van één SEM-factuur in de CASH-testadministratie "demo", ongeacht de
 * proefmodus. Weigert als de ingestelde administratie niet "demo" is: zo kan dit nooit in de
 * live boekhouding terechtkomen. Gebruikt verder exact dezelfde sync-logica als de nachtelijke run
 * (inclusief bescherming tegen dubbel boeken).
 */
export async function startTestboeking(batchNumber: number, invoiceId?: number) {
  const e = env();
  if (e.CASH_ADMINISTRATIE !== TEST_ADMINISTRATIE) {
    throw new Error(`Testboeking geweigerd: administratie is "${e.CASH_ADMINISTRATIE}", alleen "${TEST_ADMINISTRATIE}" is toegestaan.`);
  }
  const inst = await laadInstellingen(db());
  const echt = createSemClient({ baseUrl: e.SEM_BASE_URL, apiKey: e.SEM_API_KEY });
  const sem: SemClient = {
    async fetchBatches() {
      return (await echt.fetchBatches("2000-01-01")).filter((b) => b.BatchNumber === batchNumber);
    },
    async fetchJournaalposten(b) {
      return (await echt.fetchJournaalposten(b)).filter((p) => invoiceId == null || p.InvoiceID === invoiceId);
    },
    async fetchFacturen(b) {
      return (await echt.fetchFacturen(b)).filter((f) => invoiceId == null || f.InvoiceID === invoiceId);
    },
  };
  return runSync({
    store: supabaseStore(db()),
    sem,
    cash: createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY }),
    dryRun: false,
    startDate: "2000-01-01",
    cashInstellingen: {
      administratie: TEST_ADMINISTRATIE,
      dagboek: e.CASH_DAGBOEK || inst.cash_dagboek || "",
      debiteurenGrootboek: e.CASH_GB_DEBITEUREN || inst.cash_gb_debiteuren || "",
      kostenplaatsNegeren: inst.kostenplaatsen === "negeren",
    },
    trigger: "handmatig",
  });
}
