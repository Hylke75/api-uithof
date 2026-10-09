import { ChevronRight, Eye } from "lucide-react";
import Link from "next/link";
import { CashRegels, SemRegels } from "@/components/boeking";
import { datum, euro } from "@/components/format";
import { Banner, Kaart, Leeg, PageHeader, Pill } from "@/components/ui";
import { probeer, redigeer } from "@/lib/dashboard/resultaat";
import { leesEnv } from "@/lib/env";
import { createSemClient, type SemBatch, type SemFactuur } from "@/lib/sem/client";
import { bouwFacturen } from "@/lib/sem/facturen";
import { db } from "@/lib/supabase";
import { mapFactuur, type Mappings } from "@/lib/sync/mapping";
import { laadInstellingen, supabaseStore } from "@/lib/sync/store";

export const maxDuration = 300;

/**
 * Voorbeeld voor een gekozen periode: haalt batches en facturen uit SEM op en laat zien wat er
 * naar CASH zou gaan. Alleen lezen: er wordt niets opgeslagen en niets geboekt.
 */

const MAX_BATCHES = 25;
const isDatum = (s: string | undefined) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
const plusDagen = (d: string, n: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};
const maandVan = (d: string) => {
  const begin = `${d.slice(0, 7)}-01`;
  const eind = new Date(`${begin}T00:00:00Z`);
  eind.setUTCMonth(eind.getUTCMonth() + 1);
  eind.setUTCDate(0);
  return { van: begin, tot: eind.toISOString().slice(0, 10) };
};

export default async function Voorbeeld({ searchParams }: { searchParams: Promise<{ van?: string; tot?: string }> }) {
  const sp = await searchParams;

  const mapRes = await probeer(async () => ({ mappings: await supabaseStore(db()).laadMappings(), inst: await laadInstellingen(db()) }));
  const mappings: Mappings = mapRes.ok ? mapRes.data.mappings : { grootboek: new Map(), btwGrootboek: new Map(), debiteur: new Map() };
  const inst = mapRes.ok ? mapRes.data.inst : {};
  const cashInstellingen = {
    administratie: leesEnv("CASH_ADMINISTRATIE") ?? "",
    dagboek: leesEnv("CASH_DAGBOEK") ?? inst.cash_dagboek ?? "",
    debiteurenGrootboek: leesEnv("CASH_GB_DEBITEUREN") ?? inst.cash_gb_debiteuren ?? "",
  };

  const sem = createSemClient({ baseUrl: leesEnv("SEM_BASE_URL") ?? "", apiKey: leesEnv("SEM_API_KEY") ?? "" });
  // Alle batches (filter op aanmaakdatum doen we zelf: oude batches zijn niet "recent gewijzigd").
  const alle = await probeer(() => sem.fetchBatches("2000-01-01"));
  const nieuwste = alle.ok ? alle.data.map((b) => b.CreatedAt?.slice(0, 10) ?? "").sort().at(-1) : undefined;
  const standaard = maandVan(nieuwste || new Date().toISOString().slice(0, 10));
  const van = isDatum(sp.van) ? sp.van! : standaard.van;
  const tot = isDatum(sp.tot) ? sp.tot! : standaard.tot;

  let batches: SemBatch[] = [];
  let teVeel = false;
  const facturen: SemFactuur[] = [];
  const meldingen: string[] = [];
  let fout: string | null = alle.ok ? null : alle.fout;
  if (alle.ok) {
    batches = alle.data.filter((b) => {
      const c = b.CreatedAt?.slice(0, 10);
      return !!c && c >= plusDagen(van, -7) && c <= plusDagen(tot, 31);
    });
    teVeel = batches.length > MAX_BATCHES;
    batches = batches.slice(-MAX_BATCHES);
    const r = await probeer(async () => {
      for (const b of batches) {
        const [posten, koppen] = await Promise.all([sem.fetchJournaalposten(b), sem.fetchFacturen(b)]);
        const g = bouwFacturen(b, posten, koppen);
        meldingen.push(...g.batchProblemen);
        facturen.push(...g.facturen.filter((f) => f.factuurdatum >= van && f.factuurdatum <= tot));
      }
    });
    if (!r.ok) fout = r.fout;
  }
  facturen.sort((a, b) => a.factuurdatum.localeCompare(b.factuurdatum) || a.factuurnummer.localeCompare(b.factuurnummer, "nl", { numeric: true }));

  const resultaten = facturen.map((f) => ({ f, m: mapFactuur(f, mappings, cashInstellingen) }));
  const nOk = resultaten.filter((r) => r.m.ok).length;
  const totaal = facturen.reduce((s, f) => s + (f.totaalInclCents ?? 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Facturen"
        titel="Voorbeeld per periode"
        intro={
          <>
            Haalt facturen uit SEM ({leesEnv("SEM_BASE_URL") ?? "niet ingesteld"}) op en laat zien wat er naar CASH zou gaan.{" "}
            <strong>Alleen lezen: er wordt niets opgeslagen en niets geboekt.</strong>
          </>
        }
      />

      <Kaart>
        <form className="acties" method="get" style={{ alignItems: "flex-end" }}>
          <label className="veld">
            Factuurdatum van
            <input type="date" name="van" defaultValue={van} />
          </label>
          <label className="veld">
            Tot en met
            <input type="date" name="tot" defaultValue={tot} />
          </label>
          <button className="knop primair" type="submit">
            <Eye size={18} aria-hidden /> Tonen
          </button>
          {alle.ok && (
            <span className="toelichting">
              {alle.data.length} batches in SEM{nieuwste ? `, nieuwste aangemaakt op ${datum(nieuwste)}` : ""}.
            </span>
          )}
        </form>
      </Kaart>

      {!mapRes.ok && (
        <Banner toon="warning" titel="Mapping uit Supabase niet geladen">
          {mapRes.fout}. Het voorbeeld gebruikt de rekeningen uit SEM zonder vertaling en zonder ingesteld dagboek.
        </Banner>
      )}
      {fout && <Banner toon="danger" titel="Smart Event Manager niet bereikbaar">{redigeer(fout)}</Banner>}
      {teVeel && (
        <Banner toon="warning" titel={`Meer dan ${MAX_BATCHES} batches in deze periode`}>
          Alleen de laatste {MAX_BATCHES} zijn bekeken. Kies een kortere periode.
        </Banner>
      )}
      {meldingen.length > 0 && <Banner toon="warning" titel="Meldingen bij het ophalen">{meldingen.join(" · ")}</Banner>}

      {!fout && (
        <div className="raster raster-4">
          <div className="kaart">
            <span className="kpi-label">Batches bekeken</span>
            <div className="kpi-waarde">{batches.length}</div>
          </div>
          <div className="kaart">
            <span className="kpi-label">Facturen {datum(van)} – {datum(tot)}</span>
            <div className="kpi-waarde">{facturen.length}</div>
          </div>
          <div className="kaart">
            <span className="kpi-label">Klaar om te boeken</span>
            <div className="kpi-waarde" style={{ color: "var(--color-success)" }}>
              {nOk}
            </div>
          </div>
          <div className="kaart">
            <span className="kpi-label">Met een probleem · totaal {euro(totaal)}</span>
            <div className="kpi-waarde" style={{ color: nOk < facturen.length ? "var(--color-danger)" : undefined }}>
              {facturen.length - nOk}
            </div>
          </div>
        </div>
      )}

      {!fout && resultaten.length === 0 && (
        <Kaart>
          <Leeg>Geen facturen gevonden met een factuurdatum in deze periode.</Leeg>
        </Kaart>
      )}

      {resultaten.map(({ f, m }) => (
        <Kaart key={f.id}>
          <details className="uitklap">
            <summary>
              <ChevronRight className="chevron" size={18} aria-hidden />
              <strong>
                {f.soort === "creditnota" ? "Creditnota" : "Factuur"} {f.factuurnummer}
              </strong>
              <span className="muted">
                {datum(f.factuurdatum)} · debiteur {f.debiteurnummer} · batch {f.batchNumber} · {euro(f.totaalInclCents ?? 0)}
              </span>
              <span style={{ marginLeft: "auto" }}>{m.ok ? <Pill toon="success">Klaar om te boeken</Pill> : <Pill toon="danger">Probleem</Pill>}</span>
            </summary>
            {!m.ok && (
              <Banner toon="danger" titel="Wordt niet geboekt">
                {m.fouten.join("; ")}
              </Banner>
            )}
            <div className="raster raster-2" style={{ marginTop: 16 }}>
              <div>
                <h3>Uit Smart Event Manager</h3>
                <SemRegels sem={f} />
              </div>
              <div>
                <h3>Naar CASH</h3>
                {m.ok ? <CashRegels boeking={m.boeking} /> : <Leeg>Geen boeking: los eerst het probleem op.</Leeg>}
              </div>
            </div>
          </details>
        </Kaart>
      ))}

      <p className="toelichting">
        <Link href="/facturen">Naar de verwerkte facturen</Link>
      </p>
    </>
  );
}
