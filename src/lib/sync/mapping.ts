import { controleerBoeking, type CashBoeking } from "@/lib/cash/client";
import type { SemFactuur } from "@/lib/sem/client";

export interface GrootboekMapping {
  grootboekrekening: string;
  actief: boolean;
}

export interface Mappings {
  /** SEM-grootboek -> CASH-grootboek. Zonder rij wordt het SEM-nummer 1-op-1 gebruikt. */
  grootboek: Map<string, GrootboekMapping>;
  /** SEM-btw-code -> CASH-grootboekrekening voor de btw. Verplicht voor elke regel met btw. */
  btwGrootboek: Map<string, string>;
  /** SEM-debiteurnummer -> CASH-debiteurnummer. Zonder rij wordt het SEM-nummer 1-op-1 gebruikt. */
  debiteur: Map<string, string>;
}

export interface CashInstellingen {
  administratie: string;
  dagboek: string;
  debiteurenGrootboek: string;
}

export type MapResult = { ok: true; boeking: CashBoeking } | { ok: false; fouten: string[] };

export interface Totalen {
  exclCents: number;
  btwCents: number;
  inclCents: number;
}

export function totalen(factuur: SemFactuur): Totalen {
  let exclCents = 0;
  let btwCents = 0;
  for (const r of factuur.regels) {
    exclCents += r.bedragExclCents;
    btwCents += r.btwCents;
  }
  return { exclCents, btwCents, inclCents: exclCents + btwCents };
}

/** Vertaalt een SEM-factuur naar een CASH-boeking, of geeft alle fouten terug. */
export function mapFactuur(factuur: SemFactuur, mappings: Mappings, cash: CashInstellingen): MapResult {
  const fouten: string[] = [...factuur.problemen];

  if (factuur.regels.length === 0 && fouten.length === 0) fouten.push("Factuur heeft geen regels");

  const debiteurnummer = mappings.debiteur.get(factuur.debiteurnummer) ?? factuur.debiteurnummer;

  const regels: CashBoeking["regels"] = [];
  for (const r of factuur.regels) {
    const gb = mappings.grootboek.get(r.grootboek);
    if (gb && !gb.actief) {
      fouten.push(`Grootboekrekening ${r.grootboek} staat in de mapping op inactief`);
      continue;
    }
    const btwGrootboek = mappings.btwGrootboek.get(r.btwCode) ?? "";
    if (r.btwCents !== 0 && !btwGrootboek) {
      fouten.push(`Geen CASH-btw-rekening gekoppeld aan SEM-btw-code "${r.btwCode || "(leeg)"}"`);
      continue;
    }
    regels.push({
      grootboekrekening: gb?.grootboekrekening ?? r.grootboek,
      btwGrootboek,
      ...(r.kostenplaats ? { kostenplaats: r.kostenplaats } : {}),
      ...(r.kostendrager ? { kostendrager: r.kostendrager } : {}),
      omschrijving: r.omschrijving,
      bedragExclCents: r.bedragExclCents,
      btwCents: r.btwCents,
    });
  }

  if (fouten.length > 0) return { ok: false, fouten: [...new Set(fouten)] };

  const boeking: CashBoeking = {
    administratie: cash.administratie,
    dagboek: cash.dagboek,
    debiteurenGrootboek: cash.debiteurenGrootboek,
    boekdatum: factuur.factuurdatum,
    factuurnummer: factuur.factuurnummer,
    debiteurnummer,
    omschrijving: `${factuur.soort === "creditnota" ? "Creditnota" : "Factuur"} ${factuur.factuurnummer}`,
    totaalInclCents: totalen(factuur).inclCents,
    regels,
  };
  const formaat = controleerBoeking(boeking);
  if (formaat.length > 0) return { ok: false, fouten: formaat };
  return { ok: true, boeking };
}
