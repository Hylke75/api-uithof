import type { SemBatch, SemFactuur, SemFactuurRegel, SemInvoice, SemJournaalpost } from "./client";

/** Euro-bedrag uit SEM naar centen. */
export function centen(bedrag: number | null | undefined): number {
  return Math.round((bedrag ?? 0) * 100);
}

function datum(waarde: string | null | undefined): string {
  return (waarde ?? "").slice(0, 10);
}

/** Bedragverschil dat we nog accepteren tussen regels en factuurkop (afronding per regel). */
const MARGE_CENTS = 1;

/**
 * Bouwt per factuur een SemFactuur uit de journaalposten van een batch.
 *
 * Omzetregels zijn de journaalposten met een InvoiceLineID. Credit = omzet (positief),
 * debet = correctie/creditnota (negatief). De tegenboekingen zonder InvoiceLineID
 * (debiteur, eventueel btw) laten we weg: die maakt CASH zelf bij een verkoopboeking.
 *
 * Omdat de exacte opbouw van de journaalposten per omgeving kan verschillen, controleren we
 * de som van de regels altijd tegen de totalen uit de factuurkop (GetInvoices). Klopt dat niet,
 * dan krijgt de factuur een probleem en wordt hij niet geboekt.
 */
export function bouwFacturen(
  batch: Pick<SemBatch, "BatchNumber" | "CompanyCode">,
  posten: SemJournaalpost[],
  koppen: SemInvoice[],
): { facturen: SemFactuur[]; batchProblemen: string[] } {
  const batchProblemen: string[] = [];
  const perFactuur = new Map<number, SemJournaalpost[]>();

  let zonderFactuur = 0;
  for (const p of posten) {
    if (p.InvoiceID == null) {
      zonderFactuur++;
      continue;
    }
    const lijst = perFactuur.get(p.InvoiceID) ?? [];
    lijst.push(p);
    perFactuur.set(p.InvoiceID, lijst);
  }
  if (zonderFactuur > 0) {
    batchProblemen.push(`Batch ${batch.BatchNumber}: ${zonderFactuur} journaalpost(en) zonder factuur; niet verwerkt.`);
  }

  const kopPerId = new Map(koppen.map((k) => [k.InvoiceID, k]));
  for (const k of koppen) {
    if (!perFactuur.has(k.InvoiceID)) {
      batchProblemen.push(`Batch ${batch.BatchNumber}: factuur ${k.Number ?? k.InvoiceID} heeft geen journaalposten.`);
    }
  }

  const facturen: SemFactuur[] = [];
  for (const [invoiceId, lijst] of perFactuur) {
    const kop = kopPerId.get(invoiceId);
    const eerste = lijst[0];
    const problemen: string[] = [];

    const regels: SemFactuurRegel[] = [];
    for (const p of lijst) {
      if (p.InvoiceLineID == null) continue;
      const saldo = centen(p.CreditAmount) - centen(p.DebitAmount);
      if (saldo === 0) continue;
      const teken = Math.sign(saldo);
      const btw = teken * Math.abs(centen(p.TaxAmount));
      const excl =
        p.BaseAmount != null
          ? teken * Math.abs(centen(p.BaseAmount))
          : p.IsAmountInclusiveTax
            ? saldo - btw
            : saldo;
      const verwacht = p.IsAmountInclusiveTax ? excl + btw : excl;
      if (Math.abs(verwacht - saldo) > MARGE_CENTS) {
        problemen.push(`Journaalpost ${p.JournalEntryID}: debet/credit sluit niet aan op basisbedrag en btw.`);
      }
      if (p.AccountCode == null || String(p.AccountCode).trim() === "") {
        problemen.push(`Journaalpost ${p.JournalEntryID}: grootboekrekening ontbreekt.`);
      }
      regels.push({
        grootboek: String(p.AccountCode ?? "").trim(),
        btwCode: (p.TaxCode ?? "").trim(),
        btwPercentage: p.TaxPercentage,
        kostenplaats: p.CostCenterCode?.trim() || null,
        kostendrager: p.CostUnitCode?.trim() || null,
        omschrijving: (p.InvoiceLineDescription ?? "").trim(),
        bedragExclCents: excl,
        btwCents: btw,
      });
    }
    if (regels.length === 0) problemen.push("Geen omzetregels gevonden in de journaalposten.");

    const totaalExclCents = kop?.TotalAmountEx != null ? centen(kop.TotalAmountEx) : null;
    const totaalInclCents = kop?.TotalAmountIn != null ? centen(kop.TotalAmountIn) : null;
    const somExcl = regels.reduce((s, r) => s + r.bedragExclCents, 0);
    const somIncl = regels.reduce((s, r) => s + r.bedragExclCents + r.btwCents, 0);
    if (!kop) {
      problemen.push("Factuurkop niet gevonden via GetInvoices; totalen niet te controleren.");
    } else {
      if (totaalExclCents != null && Math.abs(totaalExclCents - somExcl) > MARGE_CENTS) {
        problemen.push(`Som van de regels excl. btw (${somExcl / 100}) wijkt af van het factuurtotaal (${totaalExclCents / 100}).`);
      }
      if (totaalInclCents != null && Math.abs(totaalInclCents - somIncl) > MARGE_CENTS) {
        problemen.push(`Som van de regels incl. btw (${somIncl / 100}) wijkt af van het factuurtotaal (${totaalInclCents / 100}).`);
      }
    }

    const factuurnummer = String(kop?.Number ?? eerste.InvoiceNumber ?? "").trim();
    const factuurdatum = datum(kop?.InvoiceDate ?? eerste.InvoiceDate);
    const debiteurnummer = String(kop?.DebtorNumber ?? eerste.DebtorNumber ?? "").trim();
    if (!factuurnummer) problemen.push("Factuurnummer ontbreekt.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(factuurdatum)) problemen.push("Factuurdatum ontbreekt of is ongeldig.");
    if (!debiteurnummer) problemen.push("Debiteurnummer ontbreekt.");

    facturen.push({
      id: String(invoiceId),
      factuurnummer,
      factuurdatum,
      soort: (totaalInclCents ?? somIncl) < 0 ? "creditnota" : "factuur",
      debiteurnummer,
      batchNumber: batch.BatchNumber,
      companyCode: batch.CompanyCode,
      regels,
      totaalExclCents,
      totaalInclCents,
      problemen,
    });
  }

  return { facturen, batchProblemen };
}
