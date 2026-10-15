import { createCashClient } from "@/lib/cash/client";
import { env, leesEnv } from "@/lib/env";
import { createSemClient, type SemClient } from "@/lib/sem/client";
import { db } from "@/lib/supabase";
import type { CashInstellingen } from "./mapping";
import { runSync } from "./run";
import { laadInstellingen, supabaseStore } from "./store";

/** De enige CASH-administratie waarin een testboeking is toegestaan. */
export const TEST_ADMINISTRATIE = "demo";

/**
 * CASH-instellingen voor een run: een omgevingsvariabele in Vercel gaat voor, anders de waarde uit
 * de tabel `instellingen`. Het dagboek staat altijd in hoofdletters, zoals CASH het opslaat.
 */
export function cashInstellingenVan(
  e: ReturnType<typeof env>,
  inst: Record<string, string>,
  { administratie = e.CASH_ADMINISTRATIE, dagboek }: { administratie?: string; dagboek?: string } = {},
): CashInstellingen {
  return {
    administratie,
    dagboek: (dagboek || e.CASH_DAGBOEK || inst.cash_dagboek || "").toUpperCase(),
    debiteurenGrootboek: e.CASH_GB_DEBITEUREN || inst.cash_gb_debiteuren || "",
  };
}

/** Eerste factuurnummer voor de koppeling (SYNC_START_FACTUUR of instelling start_factuurnummer). */
export function startFactuurnummerVan(inst: Record<string, string>): number | undefined {
  const waarde = leesEnv("SYNC_START_FACTUUR") || inst.start_factuurnummer;
  if (!waarde) return undefined;
  const n = Number(waarde);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Ongeldig startfactuurnummer "${waarde}".`);
  return n;
}

/**
 * Start een sync met de productieconfiguratie uit de omgevingsvariabelen. Echt boeken buiten de
 * testadministratie kan alleen als CASH_LIVE_ADMINISTRATIE bewust op dezelfde administratie staat.
 */
export async function startSync(trigger: "cron" | "handmatig") {
  const e = env();
  if (!e.SYNC_DRY_RUN && e.CASH_ADMINISTRATIE !== TEST_ADMINISTRATIE && leesEnv("CASH_LIVE_ADMINISTRATIE") !== e.CASH_ADMINISTRATIE) {
    throw new Error(
      `Sync geweigerd: echt boeken in administratie "${e.CASH_ADMINISTRATIE}" vereist CASH_LIVE_ADMINISTRATIE=${e.CASH_ADMINISTRATIE}.`,
    );
  }
  const inst = await laadInstellingen(db());
  return runSync({
    store: supabaseStore(db()),
    sem: createSemClient({ baseUrl: e.SEM_BASE_URL, apiKey: e.SEM_API_KEY }),
    cash: createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY }),
    dryRun: e.SYNC_DRY_RUN,
    startDate: e.SYNC_START_DATE,
    startFactuurnummer: startFactuurnummerVan(inst),
    cashInstellingen: cashInstellingenVan(e, inst),
    trigger,
  });
}

export interface TestboekingOpties {
  /** Alleen deze SEM-factuur (InvoiceID); zonder: de hele batch. */
  invoiceId?: number;
  /** Alleen omzetten en tonen, niets naar CASH. */
  proef?: boolean;
  /** Ander dagboek in de testadministratie dan het ingestelde. */
  dagboek?: string;
}

/**
 * Echte testboeking van één SEM-factuur in de CASH-testadministratie "demo", ongeacht de
 * proefmodus. Weigert als de ingestelde administratie niet "demo" is: zo kan dit nooit in de
 * live boekhouding terechtkomen. Gebruikt verder exact dezelfde sync-logica als de nachtelijke run
 * (inclusief bescherming tegen dubbel boeken).
 */
export async function startTestboeking(batchNumber: number, { invoiceId, proef = false, dagboek }: TestboekingOpties = {}) {
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
    dryRun: proef,
    startDate: "2000-01-01",
    cashInstellingen: cashInstellingenVan(e, inst, { administratie: TEST_ADMINISTRATIE, dagboek }),
    trigger: "test",
  });
}
