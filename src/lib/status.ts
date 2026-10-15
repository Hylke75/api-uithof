/** Factuurstatussen en hun labels. Geen servercode: ook bruikbaar in componenten. */
export const STATUSSEN = ["proef", "nieuw", "geboekt", "fout", "gewijzigd_na_boeking"] as const;
export type FactuurStatus = (typeof STATUSSEN)[number];

export const STATUS_LABEL: Record<string, string> = {
  proef: "Proef (niet geboekt)",
  nieuw: "Uitkomst onbekend",
  geboekt: "Geboekt",
  fout: "Fout",
  gewijzigd_na_boeking: "Gewijzigd na boeking",
};
