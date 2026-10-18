import type { SemRelatie } from "@/lib/sem/client";
import type { Veld } from "./client";

// "|" is het veldscheidingsteken van CASH en mag nergens in een waarde staan.
const schoon = (s: string | null | undefined) => (s ?? "").replace(/\|/g, "-").replace(/\s+/g, " ").trim();
const LIDWOORDEN = new Set(["DE", "HET", "EEN", "THE", "VAN"]);
const max = (s: string, n: number) => s.slice(0, n).trim();

/**
 * Relatie (record 101) voor CASH uit een SEM-klant, ingevuld zoals de boekhouding het doet:
 * zoeknaam = eerste woord van de naam in hoofdletters, soort D (debiteur), code plaats N + land NL,
 * valuta EUR; naam = organisatie (of persoon), t.a.v. = contactpersoon, adres en pc + plaats van het
 * factuuradres (anders het postadres). Geeft null als verplichte gegevens ontbreken.
 */
export function relatieRecord(r: SemRelatie): Veld | null {
  const nummer = schoon(r.DebtorNumber);
  const persoon = schoon([r.Initials || r.FirstName, r.Prefix, r.LastName].filter(Boolean).join(" "));
  const naam = max(schoon(r.OrganizationName) || persoon, 35);
  const adres = max(schoon(r.InvoiceStreetAndNumber) || schoon(r.PostalStreetAndNumber), 35);
  const pc = schoon(r.InvoicePostalCode) || schoon(r.PostalPostalCode);
  const plaats = schoon(r.InvoiceCity) || schoon(r.PostalCity);
  const land = (schoon(r.InvoiceCountryCode) || schoon(r.PostalCountryCode) || "NL").toUpperCase().slice(0, 2);
  if (!/^\d{1,6}$/.test(nummer) || !naam || !plaats) return null;

  const woorden = naam.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const zoeknaam = (woorden.find((w) => !LIDWOORDEN.has(w)) ?? woorden[0] ?? nummer).slice(0, 10);
  const email = schoon(r.EMailAddress);
  return {
    F0101: nummer,
    F0102: zoeknaam,
    F0103: naam,
    ...(schoon(r.OrganizationName) && persoon ? { F0104: max(persoon, 35) } : {}),
    ...(adres ? { F0105: adres } : {}),
    F0107: max(`${pc} ${plaats}`, 35),
    F0121: "D",
    ...(land === "NL" ? { F0129: "N" } : {}),
    F0130: land,
    ...(email && email.length <= 72 ? { F0120: email } : {}),
    F0983: "EUR",
  };
}
