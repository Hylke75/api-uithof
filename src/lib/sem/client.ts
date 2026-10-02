/**
 * Koppeling met Smart Event Manager (SEM).
 *
 * STUB: de echte implementatie volgt zodra de API-documentatie en een login beschikbaar zijn.
 * De typen hieronder zijn onze interne representatie; de vertaling van het SEM-formaat
 * hiernaartoe hoort in deze module thuis.
 */

export type FactuurSoort = "factuur" | "creditnota";

export interface SemFactuurRegel {
  omzetsoort: string;
  omschrijving: string;
  /** Bedrag exclusief btw in centen; negatief bij creditnota's. */
  bedragExclCents: number;
  btwCents: number;
}

export interface SemFactuur {
  id: string;
  factuurnummer: string;
  /** YYYY-MM-DD */
  factuurdatum: string;
  soort: FactuurSoort;
  debiteurId: string;
  debiteurNaam?: string;
  regels: SemFactuurRegel[];
}

export interface SemClient {
  /** Facturen met een factuurdatum tussen `from` en `to` (beide inclusief, YYYY-MM-DD). */
  fetchFacturen(from: string, to: string): Promise<SemFactuur[]>;
}

export function createSemClient(_config: { baseUrl: string; apiKey: string }): SemClient {
  return {
    async fetchFacturen() {
      throw new Error("SEM-koppeling nog niet geïmplementeerd: wacht op API-documentatie en login.");
    },
  };
}
