"use server";

import { revalidatePath } from "next/cache";
import { wisVerbindingenCache } from "@/lib/dashboard/verbindingen";
import { redigeer } from "@/lib/dashboard/resultaat";
import { startSync } from "@/lib/sync";

export interface SyncUitkomst {
  ok: boolean;
  bericht: string;
  details?: string[];
}

/**
 * Start dezelfde sync als de nachtelijke cron. Of er geboekt wordt bepaalt de server
 * (SYNC_DRY_RUN), niet de interface. Beveiligd door dezelfde Basic Auth als de pagina's.
 */
export async function startSyncActie(): Promise<SyncUitkomst> {
  try {
    const r = await startSync("handmatig");
    revalidatePath("/", "layout");
    const tellingen = `${r.n_batches} batch(es), ${r.n_opgehaald} facturen: ${r.n_geboekt} geboekt, ${r.n_proef} proef, ${r.n_overgeslagen} overgeslagen, ${r.n_fout} met een fout.`;
    if (r.status === "failed") return { ok: false, bericht: `Synchronisatie mislukt (run ${r.runId.slice(0, 8)}).`, details: r.meldingen.map(redigeer) };
    const proef = r.n_geboekt === 0 && r.n_proef > 0 ? " Er is niets in CASH geboekt (proefmodus)." : "";
    return {
      ok: r.status === "success",
      bericht: `Synchronisatie ${r.status === "success" ? "voltooid" : "deels gelukt"}: ${tellingen}${proef}`,
      details: r.meldingen.map(redigeer),
    };
  } catch (e) {
    return { ok: false, bericht: `Synchronisatie niet gestart: ${redigeer(e instanceof Error ? e.message : String(e))}` };
  }
}

/** Alleen-lezende hercontrole van de verbindingen: wist de cache en laadt de pagina's opnieuw. */
export async function verbindingenControlerenActie() {
  wisVerbindingenCache();
  revalidatePath("/", "layout");
}
