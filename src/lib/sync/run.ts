import type { CashClient } from "@/lib/cash/client";
import type { SemClient, SemFactuur } from "@/lib/sem/client";
import { contentHash } from "./hash";
import { mapFactuur, totalen } from "./mapping";
import type { FactuurRow, RunTellingen, SyncStore } from "./store";

/**
 * Hoeveel dagen het venster terugkijkt vóór het einde van de vorige run, om laat
 * ingevoerde facturen mee te nemen. Dubbel ophalen is veilig: facturen zijn uniek op
 * SEM-id en een geboekte factuur wordt nooit opnieuw geboekt.
 */
export const LOOKBACK_DAGEN = 7;

export interface SyncOptions {
  store: SyncStore;
  sem: SemClient;
  cash: CashClient;
  dryRun: boolean;
  /** Vroegste factuurdatum die ooit meegenomen wordt (YYYY-MM-DD). */
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

export async function runSync(opts: SyncOptions): Promise<SyncResultaat> {
  const { store, sem, cash, dryRun, startDate, administratie } = opts;

  const vorige = await store.laatsteVoltooideRun();
  const windowTo = datumNL(opts.now ?? new Date());
  let windowFrom = vorige ? minDagen(vorige.window_to, LOOKBACK_DAGEN) : startDate;
  if (windowFrom < startDate) windowFrom = startDate;

  const runId = await store.startRun({ dry_run: dryRun, trigger: opts.trigger, window_from: windowFrom, window_to: windowTo });
  const t: RunTellingen = { n_opgehaald: 0, n_geboekt: 0, n_proef: 0, n_overgeslagen: 0, n_fout: 0 };

  try {
    const mappings = await store.laadMappings();
    const facturen = (await sem.fetchFacturen(windowFrom, windowTo)).filter((f) => f.factuurdatum >= startDate);
    t.n_opgehaald = facturen.length;

    const bestaand = await store.bestaandeFacturen(facturen.map((f) => f.id));

    for (const factuur of facturen) {
      const hash = contentHash(factuur);
      const vorigeVersie = bestaand.get(factuur.id);

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
        continue;
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
        continue;
      }

      const basis = basisRij(factuur, hash, runId);
      const mapped = mapFactuur(factuur, mappings, administratie);

      if (!mapped.ok) {
        await store.upsertFactuur({ ...basis, status: "fout", foutmelding: mapped.fouten.join("; "), cash_payload: null });
        t.n_fout++;
        continue;
      }

      if (dryRun) {
        await store.upsertFactuur({ ...basis, status: "proef", cash_payload: mapped.boeking, foutmelding: null });
        t.n_proef++;
        continue;
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

    const status = t.n_fout > 0 ? "partial" : "success";
    await store.finishRun(runId, { ...t, status });
    return { runId, status, windowFrom, windowTo, ...t };
  } catch (e) {
    await store.finishRun(runId, { ...t, status: "failed", error: melding(e) });
    return { runId, status: "failed", windowFrom, windowTo, ...t, error: melding(e) };
  }
}

function basisRij(factuur: SemFactuur, hash: string, runId: string): Omit<FactuurRow, "status"> {
  const tot = totalen(factuur);
  return {
    sem_factuur_id: factuur.id,
    factuurnummer: factuur.factuurnummer,
    factuurdatum: factuur.factuurdatum,
    soort: factuur.soort,
    sem_debiteur_id: factuur.debiteurId,
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
