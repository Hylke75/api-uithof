import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CashRegels, SemRegels } from "@/components/boeking";
import { datum, euro, tijd } from "@/components/format";
import { Banner, FactuurStatusPill, InlineFout, Kaart, Leeg, PageHeader } from "@/components/ui";
import type { CashBoeking } from "@/lib/cash/client";
import { probeer, redigeer } from "@/lib/dashboard/resultaat";
import type { SemFactuur } from "@/lib/sem/client";
import { db } from "@/lib/supabase";

export default async function Factuur({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await probeer(async () => {
    const { data, error } = await db().from("sem_facturen").select("*").eq("sem_factuur_id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });
  if (!r.ok) {
    return (
      <>
        <PageHeader titel={`Factuur ${id}`} />
        <InlineFout fout={r.fout} wat="Factuur" />
      </>
    );
  }
  const f = r.data;
  if (!f) notFound();

  const sem = f.sem_payload as SemFactuur;
  const boeking = f.cash_payload as CashBoeking | null;

  return (
    <>
      <p>
        <Link href="/facturen">
          <ArrowLeft size={14} aria-hidden /> Alle facturen
        </Link>
      </p>
      <PageHeader
        eyebrow={f.soort === "creditnota" ? "Creditnota" : "Factuur"}
        titel={f.factuurnummer}
        intro={
          <>
            {datum(f.factuurdatum)} · debiteur {f.sem_debiteurnummer} · batch <Link href={`/facturen?batch=${f.sem_batch_number}`}>{f.sem_batch_number}</Link> · totaal{" "}
            {euro(f.totaal_incl_cents)}
          </>
        }
        acties={<FactuurStatusPill status={f.status} />}
      />
      {f.foutmelding && (
        <Banner toon={f.status === "nieuw" ? "warning" : "danger"} titel="Melding">
          {redigeer(f.foutmelding)}
        </Banner>
      )}

      <div className="raster raster-2">
        <Kaart titel="1. Uit Smart Event Manager" id="sem">
          <SemRegels sem={sem} />
        </Kaart>
        <Kaart titel={f.status === "geboekt" ? "2. Geboekt in CASH" : "2. Voorgenomen boeking in CASH"} id="cash">
          {f.status === "proef" && <p className="toelichting">Proefmodus: deze boeking is niet naar CASH verstuurd.</p>}
          {boeking ? <CashRegels boeking={boeking} /> : <Leeg>Nog geen boeking samengesteld; zie de melding hierboven.</Leeg>}
        </Kaart>
      </div>

      <Kaart titel="Verwerking" id="verwerking">
        <dl className="definities">
          <dt>SEM-InvoiceID</dt>
          <dd>
            <code>{f.sem_factuur_id}</code>
          </dd>
          <dt>Eerst opgehaald</dt>
          <dd>{tijd(f.created_at)}</dd>
          <dt>Laatst bijgewerkt</dt>
          <dd>{tijd(f.updated_at)}</dd>
          <dt>Geboekt op</dt>
          <dd>{f.geboekt_at ? tijd(f.geboekt_at) : <span className="muted">niet geboekt</span>}</dd>
          <dt>CASH-referentie</dt>
          <dd>{f.cash_boeking_id ?? <span className="muted">—</span>}</dd>
          <dt>Laatste run</dt>
          <dd>{f.laatste_run_id ? <Link href={`/logboek?run=${f.laatste_run_id}`}>{String(f.laatste_run_id).slice(0, 8)}</Link> : "—"}</dd>
        </dl>
        <details className="uitklap">
          <summary>Ruwe data uit SEM (JSON)</summary>
          <pre>{JSON.stringify(sem, null, 2)}</pre>
        </details>
      </Kaart>
    </>
  );
}
