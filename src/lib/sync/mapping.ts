import type { CashBoeking } from "@/lib/cash/client";
import type { SemFactuur } from "@/lib/sem/client";

export interface OmzetsoortMapping {
  grootboekrekening: string;
  btwCode: string;
  kostenplaats?: string | null;
  actief: boolean;
}

export interface Mappings {
  omzetsoort: Map<string, OmzetsoortMapping>;
  /** SEM-debiteur-id -> CASH-debiteurnummer */
  debiteur: Map<string, string>;
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

/** Vertaalt een SEM-factuur naar een CASH-boeking, of geeft alle mappingfouten terug. */
export function mapFactuur(factuur: SemFactuur, mappings: Mappings, administratie: string): MapResult {
  const fouten: string[] = [];

  if (factuur.regels.length === 0) fouten.push("Factuur heeft geen regels");

  for (const r of factuur.regels) {
    if (!Number.isInteger(r.bedragExclCents) || !Number.isInteger(r.btwCents)) {
      fouten.push(`Regel "${r.omschrijving}": bedrag is geen geheel aantal centen`);
    }
  }

  const debiteurnummer = mappings.debiteur.get(factuur.debiteurId);
  if (!debiteurnummer) fouten.push(`Geen CASH-debiteur gekoppeld aan SEM-debiteur ${factuur.debiteurId}`);

  const regels: CashBoeking["regels"] = [];
  for (const r of factuur.regels) {
    const m = mappings.omzetsoort.get(r.omzetsoort);
    if (!m) {
      fouten.push(`Geen mapping voor omzetsoort "${r.omzetsoort}"`);
      continue;
    }
    if (!m.actief) {
      fouten.push(`Mapping voor omzetsoort "${r.omzetsoort}" staat op inactief`);
      continue;
    }
    regels.push({
      grootboekrekening: m.grootboekrekening,
      btwCode: m.btwCode,
      ...(m.kostenplaats ? { kostenplaats: m.kostenplaats } : {}),
      omschrijving: r.omschrijving,
      bedragExclCents: r.bedragExclCents,
      btwCents: r.btwCents,
    });
  }

  if (fouten.length > 0) return { ok: false, fouten: [...new Set(fouten)] };

  return {
    ok: true,
    boeking: {
      administratie,
      boekdatum: factuur.factuurdatum,
      factuurnummer: factuur.factuurnummer,
      debiteurnummer: debiteurnummer!,
      omschrijving: `${factuur.soort === "creditnota" ? "Creditnota" : "Factuur"} ${factuur.factuurnummer}`,
      totaalInclCents: totalen(factuur).inclCents,
      regels,
    },
  };
}
