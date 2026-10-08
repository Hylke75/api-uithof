/**
 * Koppeling met CASH.
 *
 * STUB: de echte implementatie volgt zodra de API-documentatie, een API-key en de
 * testadministratie beschikbaar zijn.
 */

export interface CashBoekingRegel {
  grootboekrekening: string;
  btwCode: string;
  kostenplaats?: string;
  kostendrager?: string;
  omschrijving: string;
  bedragExclCents: number;
  btwCents: number;
}

export interface CashBoeking {
  administratie: string;
  /** YYYY-MM-DD */
  boekdatum: string;
  factuurnummer: string;
  debiteurnummer: string;
  omschrijving: string;
  totaalInclCents: number;
  regels: CashBoekingRegel[];
}

export interface CashClient {
  boekFactuur(boeking: CashBoeking): Promise<{ boekingId: string }>;
}

export function createCashClient(_config: { baseUrl: string; apiKey: string }): CashClient {
  return {
    async boekFactuur() {
      throw new Error("CASH-koppeling nog niet geïmplementeerd: wacht op API-documentatie en API-key.");
    },
  };
}
