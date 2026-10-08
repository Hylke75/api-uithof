import type { CashClient } from "@/lib/cash/client";
import type { SemClient, SemFactuur } from "@/lib/sem/client";
import { bouwFacturen } from "@/lib/sem/facturen";
import { contentHash } from "./hash";
import { mapFactuur, totalen, type Mappings } from "./mapping";
import type { FactuurRow, RunTellingen, SyncStore } from "./store";

/**
 * Hoeveel dagen we bij het ophalen van batches terugkijken vóór de vorige run. Dubbel ophalen
 * is veilig: facturen zijn uniek op SEM-InvoiceID en een geboekte factuur wordt nooit opnieuw
 * geboekt.
 */
export const LOOKBACK_DAGEN = 7;

export interface SyncOptions {
  store: SyncStore;
  sem: SemClient;
  cash: CashClient;
  dryRun: boolean;
  /** Vroegste factuurdatum die ooit geboekt wordt, en vroegste wijzigingsdatum voor batches (YYYY-MM-DD). */
  startDate: string;
  administratie: string;
  trigger: "cron" | "handmatig";
  now?: Date;
}

export interface SyncResultaat extends RunTellingen {
  runId: string;
  status: "success" | "partial" | "failed";
  windowFrom: string;
  windowTo: string;
  meldingen: string[];
  error?: string;
}

/** Kalenderdatum in Nederland, als YYYY-MM-DD. */
export function datumNL(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(d);
}

function minDagen(datum: string, dagen: number): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dagen);
  return d.toISOString().slice(0, 10);
}

const isDatum = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function runSync(opts: SyncOptions): Promise<SyncResultaat> {
  const { store, sem, dryRun, startDate } = opts;

  const vorige = await store.laatsteVoltooideRun();
  const windowTo = datumNL(opts.now ?? new Date());
  let windowFrom = vorige ? minDagen(vorige.window_to, LOOKBACK_DAGEN) : startDate;
  if (windowFrom < startDate) windowFrom = startDate;

  const runId = await store.startRun({ dry_run: dryRun, trigger: opts.trigger, window_from: windowFrom, window_to: windowTo });
  const t: RunTellingen = { n_batches: 0, n_opgehaald: 0, n_geboekt: 0, n_proef: 0, n_overgeslagen: 0, n_fout: 0 };
  const meldingen: string[] = [];

  try {
    const mappings = await store.laadMappings();
    const batches = await sem.fetchBatches(windowFrom);
    t.n_batches = batches.length;

    for (const batch of batches) {
      let facturen: SemFactuur[];
      try {
        const [posten, koppen] = await Promise.all([sem.fetchJournaalposten(batch), sem.fetchFacturen(batch)]);
        const gebouwd = bouwFacturen(batch, posten, koppen);
        facturen = gebouwd.facturen;
        meldingen.push(...gebouwd.batchProblemen);
        t.n_fout += gebouwd.batchProblemen.length;
      } catch (e) {
        meldingen.push(`Batch ${batch.BatchNumber}: ophalen mislukt: ${melding(e)}`);
        t.n_fout++;
        await store.upsertBatch({ batch, runId, nFacturen: 0, fout: melding(e) });
        continue;
      }

      t.n_opgehaald += facturen.length;
      const bestaand = await store.bestaandeFacturen(facturen.map((f) => f.id));
      for (const factuur of facturen) {
        await verwerkFactuur(factuur, bestaand.get(factuur.id), { ...opts, mappings, runId, t });
      }
      await store.upsertBatch({ batch, runId, nFacturen: facturen.length, fout: null });
    }

    const status = t.n_fout > 0 ? "partial" : "success";
    await store.finishRun(runId, { ...t, status, error: meldingen.length ? meldingen.join("\n") : null });
    return { runId, status, windowFrom, windowTo, meldingen, ...t };
  } catch (e) {
    meldingen.push(melding(e));
    await store.finishRun(runId, { ...t, status: "failed", error: meldingen.join("\n") });
    return { runId, status: "failed", windowFrom, windowTo, meldingen, ...t, error: melding(e) };
  }
}

async function verwerkFactuur(
  factuur: SemFactuur,
  vorigeVersie: { status: FactuurRow["status"]; content_hash: string } | undefined,
  ctx: SyncOptions & { mappings: Mappings; runId: string; t: RunTellingen },
) {
  const { store, cash, dryRun, startDate, administratie, mappings, runId, t } = ctx;

  if (isDatum(factuur.factuurdatum) && factuur.factuurdatum < startDate) {
    // Van vóór de overstap: die zit al via de handmatige import in CASH.
    t.n_overgeslagen++;
    return;
  }

  const hash = contentHash(factuur);

  if (vorigeVersie?.status === "geboekt" || vorigeVersie?.status === "gewijzigd_na_boeking") {
    if (vorigeVersie.status === "geboekt" && vorigeVersie.content_hash !== hash) {
      await store.markeerFactuur(factuur.id, {
        status: "gewijzigd_na_boeking",
        foutmelding: "Factuur is in SEM gewijzigd nadat hij in CASH geboekt is; handmatig controleren.",
        laatste_run_id: runId,
      });
      t.n_fout++;
    } else {
      t.n_overgeslagen++;
    }
    return;
  }

  if (vorigeVersie?.status === "nieuw") {
    // Een eerdere run is gestopt tijdens het boeken: de uitkomst in CASH is onbekend.
    // Niet automatisch opnieuw boeken, om een dubbele boeking te voorkomen.
    await store.markeerFactuur(factuur.id, {
      status: "nieuw",
      foutmelding: "Uitkomst van een eerdere boekpoging is onbekend; in CASH controleren en daarna de status handmatig aanpassen.",
      laatste_run_id: runId,
    });
    t.n_fout++;
    return;
  }

  const basis = basisRij(factuur, hash, runId);
  const mapped = mapFactuur(factuur, mappings, administratie);

  if (!mapped.ok) {
    await store.upsertFactuur({ ...basis, status: "fout", foutmelding: mapped.fouten.join("; "), cash_payload: null });
    t.n_fout++;
    return;
  }

  if (dryRun) {
    await store.upsertFactuur({ ...basis, status: "proef", cash_payload: mapped.boeking, foutmelding: null });
    t.n_proef++;
    return;
  }

  // Eerst vastleggen dat we gaan boeken; zo is een onderbroken boeking later te herkennen.
  await store.upsertFactuur({ ...basis, status: "nieuw", cash_payload: mapped.boeking, foutmelding: null });
  try {
    const { boekingId } = await cash.boekFactuur(mapped.boeking);
    await store.upsertFactuur({
      ...basis,
      status: "geboekt",
      cash_payload: mapped.boeking,
      cash_boeking_id: boekingId,
      geboekt_at: new Date().toISOString(),
      foutmelding: null,
    });
    t.n_geboekt++;
  } catch (e) {
    await store.upsertFactuur({ ...basis, status: "fout", cash_payload: mapped.boeking, foutmelding: `CASH: ${melding(e)}` });
    t.n_fout++;
  }
}

function basisRij(factuur: SemFactuur, hash: string, runId: string): Omit<FactuurRow, "status"> {
  const tot = totalen(factuur);
  return {
    sem_factuur_id: factuur.id,
    factuurnummer: factuur.factuurnummer,
    factuurdatum: isDatum(factuur.factuurdatum) ? factuur.factuurdatum : null,
    soort: factuur.soort,
    sem_debiteurnummer: factuur.debiteurnummer,
    sem_batch_number: factuur.batchNumber,
    sem_company_code: factuur.companyCode,
    totaal_excl_cents: tot.exclCents,
    totaal_btw_cents: tot.btwCents,
    totaal_incl_cents: tot.inclCents,
    sem_payload: factuur,
    content_hash: hash,
    laatste_run_id: runId,
  };
}

function melding(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
