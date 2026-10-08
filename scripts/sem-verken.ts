/**
 * Bekijk wat SEM teruggeeft, zonder iets op te slaan of te boeken.
 *
 *   npm run sem:verken -- 2026-09-01          # batches gewijzigd sinds 1 sept, laatste batch in detail
 *   npm run sem:verken -- 2026-09-01 41       # batch 41 in detail
 *
 * Leest SEM_BASE_URL en SEM_API_KEY uit .env.local.
 */
import { createSemClient } from "../src/lib/sem/client";
import { bouwFacturen } from "../src/lib/sem/facturen";

async function main() {
  const [sinds = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), batchArg] = process.argv.slice(2);
  const baseUrl = process.env.SEM_BASE_URL;
  const apiKey = process.env.SEM_API_KEY;
  if (!baseUrl || !apiKey) throw new Error("Zet SEM_BASE_URL en SEM_API_KEY in .env.local");

  const sem = createSemClient({ baseUrl, apiKey });
  const batches = await sem.fetchBatches(sinds);
  console.log(`${batches.length} batch(es) gewijzigd sinds ${sinds} op ${baseUrl}:`);
  console.table(batches);
  if (batches.length === 0) return;

  const batch = batchArg ? batches.find((b) => String(b.BatchNumber) === batchArg) : batches.at(-1);
  if (!batch) throw new Error(`Batch ${batchArg} niet gevonden`);

  const [posten, koppen] = await Promise.all([sem.fetchJournaalposten(batch), sem.fetchFacturen(batch)]);
  console.log(`\nBatch ${batch.BatchNumber}: ${posten.length} journaalposten, ${koppen.length} facturen.`);
  console.log("\nEerste journaalposten (ruw):");
  console.dir(posten.slice(0, 6), { depth: null });
  console.log("\nEerste factuurkop (ruw):");
  console.dir(koppen[0], { depth: null });

  const { facturen, batchProblemen } = bouwFacturen(batch, posten, koppen);
  console.log("\nOmgezet:");
  for (const f of facturen) {
    const status = f.problemen.length ? `PROBLEEM: ${f.problemen.join("; ")}` : "ok";
    console.log(`- ${f.soort} ${f.factuurnummer} (${f.factuurdatum}), debiteur ${f.debiteurnummer}, ${f.regels.length} regels, totaal ${(f.totaalInclCents ?? 0) / 100}: ${status}`);
  }
  for (const p of batchProblemen) console.log(`! ${p}`);
  const btwCodes = new Set(facturen.flatMap((f) => f.regels.map((r) => r.btwCode)));
  const grootboeken = new Set(facturen.flatMap((f) => f.regels.map((r) => r.grootboek)));
  console.log(`\nGebruikte btw-codes: ${[...btwCodes].join(", ") || "-"}`);
  console.log(`Gebruikte grootboekrekeningen: ${[...grootboeken].join(", ") || "-"}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
