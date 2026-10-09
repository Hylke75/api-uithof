import type { SemBatch, SemBtwRegel, SemFactuur, SemFactuurRegel, SemInvoice, SemJournaalpost } from "./client";

/** Euro-bedrag uit SEM naar centen. */
export function centen(bedrag: number | null | undefined): number {
  return Math.round((bedrag ?? 0) * 100);
}

function datum(waarde: string | null | undefined): string {
  return (waarde ?? "").slice(0, 10);
}

/** Bedragverschil dat we nog accepteren tussen regels en factuurkop (afronding per regel). */
const MARGE_CENTS = 1;

const tekst = (x: unknown) => String(x ?? "").trim();

/**
 * Bouwt per factuur een SemFactuur uit de journaalposten van een batch.
 *
 * SEM levert per factuur een sluitende journaalpost (vastgesteld op de testomgeving, batch 94):
 * - DEB: debiteurregel, debet = totaal incl. btw, op de debiteurenrekening;
 * - OPB: omzetregels (met InvoiceLineID), credit = bedrag excl. btw, TaxAmount = btw van de regel;
 * - BHO/BLA/…: btw-regels per tarief, credit = btw-bedrag, op de btw-rekening.
 * BaseAmount is op omzetregels 0 en wordt dus niet gebruikt. Credit telt positief (factuur),
 * debet negatief (creditnota).
 *
 * Controles: de journaalpost moet op nul sluiten en aansluiten op de totalen uit de factuurkop
 * (GetInvoices). Klopt dat niet, dan krijgt de factuur een probleem en wordt hij niet geboekt.
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
    const btwPerRekening = new Map<string, SemBtwRegel>();
    let debiteurPost: SemJournaalpost | undefined;
    let saldoTotaal = 0;

    for (const p of lijst) {
      const saldo = centen(p.CreditAmount) - centen(p.DebitAmount);
      saldoTotaal += saldo;
      const soort = tekst(p.AccountTypeCode).toUpperCase();

      if (p.AccountCode == null || tekst(p.AccountCode) === "") {
        if (saldo !== 0) problemen.push(`Journaalpost ${p.JournalEntryID}: grootboekrekening ontbreekt.`);
        continue;
      }

      if (soort === "DEB" || (!soort && p.InvoiceLineID == null && p.DebtorNumber && saldo < 0)) {
        if (debiteurPost) problemen.push("Meer dan één debiteurregel in de journaalpost.");
        debiteurPost = p;
        continue;
      }

      if (p.InvoiceLineID != null) {
        if (saldo === 0 && centen(p.TaxAmount) === 0) continue;
        const teken = saldo < 0 ? -1 : 1;
        const btw = teken * Math.abs(centen(p.TaxAmount));
        if (p.IsAmountInclusiveTax && p.AmountInclusiveTax != null && Math.abs(Math.abs(saldo) + Math.abs(btw) - Math.abs(centen(p.AmountInclusiveTax))) > MARGE_CENTS) {
          problemen.push(`Journaalpost ${p.JournalEntryID}: bedrag excl. btw plus btw sluit niet aan op het bedrag incl. btw.`);
        }
        regels.push({
          grootboek: tekst(p.AccountCode),
          btwCode: tekst(p.TaxCode),
          btwPercentage: p.TaxPercentage,
          kostenplaats: tekst(p.CostCenterCode) || null,
          kostendrager: tekst(p.CostUnitCode) || null,
          omschrijving: tekst(p.InvoiceLineDescription),
          bedragExclCents: saldo,
          btwCents: btw,
        });
        continue;
      }

      // Overige posten zonder factuurregel: btw-regels (BHO/BLA/…).
      if (saldo === 0) continue;
      const rekening = tekst(p.AccountCode);
      const bestaand = btwPerRekening.get(rekening);
      if (bestaand) bestaand.bedragCents += saldo;
      else btwPerRekening.set(rekening, { grootboek: rekening, btwCode: tekst(p.TaxCode), btwPercentage: p.TaxPercentage, bedragCents: saldo });
    }

    const btwRegels = [...btwPerRekening.values()];
    if (regels.length === 0) problemen.push("Geen omzetregels gevonden in de journaalposten.");

    const somExcl = regels.reduce((s, r) => s + r.bedragExclCents, 0);
    const somBtwRegels = regels.reduce((s, r) => s + r.btwCents, 0);
    const somBtwPosten = btwRegels.reduce((s, r) => s + r.bedragCents, 0);
    // Levert SEM aparte btw-regels, dan zijn die leidend; anders de btw per omzetregel.
    const somBtw = btwRegels.length > 0 ? somBtwPosten : somBtwRegels;
    const somIncl = somExcl + somBtw;
    if (btwRegels.length > 0 && Math.abs(somBtwPosten - somBtwRegels) > Math.max(MARGE_CENTS, regels.length)) {
      problemen.push(`Btw op de regels (${somBtwRegels / 100}) wijkt af van de btw-regels uit SEM (${somBtwPosten / 100}).`);
    }

    // Sluitend: debiteur + omzet + btw = 0. Zonder aparte btw-regels telt de btw per omzetregel mee.
    const balans = saldoTotaal + (btwRegels.length === 0 ? somBtwRegels : 0);
    if (debiteurPost && balans !== 0) problemen.push(`De journaalpost uit SEM sluit niet op nul (verschil ${balans / 100}).`);

    const debiteurTotaalCents = debiteurPost ? centen(debiteurPost.DebitAmount) - centen(debiteurPost.CreditAmount) : null;
    if (debiteurTotaalCents != null && debiteurTotaalCents !== somIncl) {
      problemen.push(`Debiteurregel (${debiteurTotaalCents / 100}) sluit niet aan op omzet plus btw (${somIncl / 100}).`);
    }

    const totaalExclCents = kop?.TotalAmountEx != null ? centen(kop.TotalAmountEx) : null;
    const totaalInclCents = kop?.TotalAmountIn != null ? centen(kop.TotalAmountIn) : null;
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

    const factuurnummer = tekst(kop?.Number ?? eerste.InvoiceNumber);
    const factuurdatum = datum(kop?.InvoiceDate ?? eerste.InvoiceDate);
    const debiteurnummer = tekst(kop?.DebtorNumber ?? eerste.DebtorNumber);
    if (!factuurnummer) problemen.push("Factuurnummer ontbreekt.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(factuurdatum)) problemen.push("Factuurdatum ontbreekt of is ongeldig.");
    if (!debiteurnummer) problemen.push("Debiteurnummer ontbreekt.");

    facturen.push({
      id: String(invoiceId),
      factuurnummer,
      factuurdatum,
      soort: (totaalInclCents ?? somIncl) < 0 ? "creditnota" : "factuur",
      debiteurnummer,
      btwRegels,
      debiteurTotaalCents,
      debiteurGrootboek: debiteurPost ? tekst(debiteurPost.AccountCode) : null,
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
