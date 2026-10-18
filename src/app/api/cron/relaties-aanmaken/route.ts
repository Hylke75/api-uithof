import { NextResponse, type NextRequest } from "next/server";
import { weigerZonderCronGeheim } from "@/lib/auth";
import { createCashClient } from "@/lib/cash/client";
import { relatieRecord } from "@/lib/cash/relatie";
import { redigeer } from "@/lib/dashboard/resultaat";
import { env } from "@/lib/env";
import { createSemClient } from "@/lib/sem/client";
import { TEST_ADMINISTRATIE } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cron/relaties-aanmaken?batch=1006&debiteuren=152234,152482[&proef=1][&admin=demo]
 * Maakt debiteuren die nog niet in CASH bestaan aan als relatie, met de klantgegevens uit SEM.
 * Het SEM-klantnummer (RelationID) komt uit de factuurkoppen van de batch. Bestaande relaties
 * worden overgeslagen. &proef=1: alleen tonen wat er aangemaakt zou worden.
 */
export async function POST(req: NextRequest) {
  const geweigerd = weigerZonderCronGeheim(req);
  if (geweigerd) return geweigerd;
  const e = env();
  const sp = req.nextUrl.searchParams;
  const batch = Number(sp.get("batch"));
  const debiteuren = (sp.get("debiteuren") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const proef = sp.get("proef") === "1";
  // Alleen de ingestelde administratie, of demo om te testen.
  const admin = sp.get("admin") === TEST_ADMINISTRATIE ? TEST_ADMINISTRATIE : e.CASH_ADMINISTRATIE;
  if (!Number.isInteger(batch) || batch <= 0) return NextResponse.json({ error: "batch ontbreekt" }, { status: 400 });
  if (!debiteuren.length || debiteuren.some((d) => !/^\d{1,6}$/.test(d))) return NextResponse.json({ error: "debiteuren: nummers, komma-gescheiden" }, { status: 400 });

  const sem = createSemClient({ baseUrl: e.SEM_BASE_URL, apiKey: e.SEM_API_KEY });
  const cash = createCashClient({ baseUrl: e.CASH_BASE_URL, apiKey: e.CASH_API_KEY });
  try {
    const koppen = await sem.fetchFacturen({ BatchNumber: batch, CompanyCode: null });
    const relationIds = new Map(koppen.filter((k) => k.DebtorNumber && k.RelationID).map((k) => [String(k.DebtorNumber), k.RelationID!]));
    const bestaand = await cash.relaties(admin);

    const resultaten = [];
    for (const deb of debiteuren) {
      if (bestaand.has(Number(deb))) {
        resultaten.push({ debiteur: deb, uitkomst: "bestaat al" });
        continue;
      }
      const relationId = relationIds.get(deb);
      const semRelatie = relationId ? await sem.fetchRelatie(relationId) : null;
      const record = semRelatie && String(semRelatie.DebtorNumber) === deb ? relatieRecord(semRelatie) : null;
      if (!record) {
        // Welke verplichte gegevens ontbreken (zonder de inhoud te tonen).
        const ontbreekt = !relationId
          ? ["niet gevonden in batch"]
          : !semRelatie
            ? ["klant niet gevonden in SEM"]
            : [
                ...(String(semRelatie.DebtorNumber) !== deb ? [`ander debiteurnummer in SEM (${semRelatie.DebtorNumber})`] : []),
                ...(!(semRelatie.OrganizationName || semRelatie.LastName) ? ["naam"] : []),
                ...(!(semRelatie.InvoiceCity || semRelatie.PostalCity) ? ["plaats"] : []),
              ];
        resultaten.push({ debiteur: deb, uitkomst: `gegevens in SEM onvolledig: ${ontbreekt.join(", ") || "onbekend"}` });
        continue;
      }
      // Alleen naam en plaats tonen; geen contactgegevens in het antwoord.
      const overzicht = { naam: record.F0103, plaats: record.F0107, land: record.F0130 };
      if (proef) {
        resultaten.push({ debiteur: deb, uitkomst: "zou aangemaakt worden", ...overzicht });
        continue;
      }
      try {
        await cash.maakRelatie(admin, record);
        resultaten.push({ debiteur: deb, uitkomst: "aangemaakt", ...overzicht });
      } catch (fout) {
        resultaten.push({ debiteur: deb, uitkomst: redigeer(fout instanceof Error ? fout.message : String(fout)) });
      }
    }
    const naAfloop = proef ? null : await cash.relaties(admin);
    return NextResponse.json({
      admin,
      proef,
      resultaten,
      ...(naAfloop ? { nuInCash: debiteuren.filter((d) => naAfloop.has(Number(d))).length, van: debiteuren.length } : {}),
    });
  } catch (fout) {
    return NextResponse.json({ error: redigeer(fout instanceof Error ? fout.message : String(fout)) }, { status: 500 });
  }
}
