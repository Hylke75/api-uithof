import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Configuratie } from "@/lib/dashboard/data";
import { systeemStatus, type VerbindingStatus } from "@/lib/dashboard/resultaat";
import { verbindingen, type Verbindingen } from "@/lib/dashboard/verbindingen";
import { StatusIcoon, VerbindingPill } from "./ui";
import { tijd } from "./format";

/** Afgeleide status per systeem; CASH is "Aandacht nodig" als de ingestelde administratie ontbreekt. */
export function statussen(v: Verbindingen) {
  const cashAdmin = v.cashAdministraties.ok && v.cashAdministraties.data.some((a) => a.code === v.administratie);
  const cash: VerbindingStatus = !v.cashAdministraties.ok ? "error" : cashAdmin ? "healthy" : "warning";
  return {
    supabase: (v.supabase.ok ? "healthy" : "error") as VerbindingStatus,
    sem: (v.sem.ok ? "healthy" : "error") as VerbindingStatus,
    cash,
    cashAdmin,
  };
}

const SYS_LABEL: Record<VerbindingStatus, string> = {
  healthy: "Alle verbindingen werken",
  warning: "Aandacht nodig",
  error: "Verbinding mislukt",
  unknown: "Niet gecontroleerd",
};

export async function SysteemStatus() {
  const v = await verbindingen();
  const s = statussen(v);
  const totaal = systeemStatus([s.supabase, s.sem, s.cash]);
  const fouten = [!v.supabase.ok && "Supabase", !v.sem.ok && "SEM", s.cash !== "healthy" && "CASH"].filter(Boolean);
  return (
    <Link href="/controle" className="systeemstatus" style={{ color: "inherit", textDecoration: "none" }} aria-label={`Systeemstatus: ${SYS_LABEL[totaal]}`}>
      <strong>
        <span className={`stip ${totaal}`} aria-hidden />
        <span className="label">{SYS_LABEL[totaal]}</span>
      </strong>
      <span className="uitleg muted">
        {fouten.length > 0 && (
          <>
            Probleem: {fouten.join(", ")}
            <br />
          </>
        )}
        Laatste controle {tijd(v.gecontroleerdOp)}
      </span>
    </Link>
  );
}

export function VerbindingKaarten({ v }: { v: Verbindingen }) {
  const s = statussen(v);
  const kaarten = [
    {
      naam: "Smart Event Manager",
      status: s.sem,
      regels: v.sem.ok
        ? [v.sem.data.url, `${v.sem.data.batches.length} batch(es) aangemaakt of gewijzigd sinds ${v.sem.data.sinds}.`]
        : [v.sem.fout],
    },
    {
      naam: "Supabase (database)",
      status: s.supabase,
      regels: v.supabase.ok ? [`Verbonden; ${v.supabase.data.runs} run(s) in het logboek.`] : [v.supabase.fout],
    },
    {
      naam: "CASH",
      status: s.cash,
      regels: !v.cashAdministraties.ok
        ? [v.cashAdministraties.fout]
        : s.cashAdmin
          ? [`Ingestelde administratie ${v.administratie} is beschikbaar.`]
          : [`Ingestelde administratie "${v.administratie || "(leeg)"}" staat niet in de lijst van deze API-gebruiker.`],
    },
  ];
  return (
    <div className="raster raster-3">
      {kaarten.map((k) => (
        <article key={k.naam} className="verbinding" aria-label={`${k.naam}: ${k.status}`}>
          <StatusIcoon status={k.status} />
          <div className="tekst">
            <h3>{k.naam}</h3>
            <VerbindingPill status={k.status} />
            {k.regels.map((r, i) => (
              <p key={i}>{r}</p>
            ))}
          </div>
          <Link className="knop klein" href="/controle">
            Details
          </Link>
        </article>
      ))}
    </div>
  );
}

/** SEM → Supabase → CASH met de echte status per stap. */
export function ProcesFlow({ v, config }: { v: Verbindingen; config: Configuratie }) {
  const s = statussen(v);
  const dagboekOk = config.dagboek.ok && !!config.dagboek.data;
  const stappen = [
    { naam: "Smart Event Manager", status: s.sem, tekst: s.sem === "healthy" ? "Batches ophalen" : "Niet bereikbaar" },
    { naam: "Supabase", status: s.supabase, tekst: s.supabase === "healthy" ? "Facturen en runs vastleggen" : "Synchronisatie geblokkeerd" },
    {
      naam: "CASH",
      status: (s.cash === "healthy" && !dagboekOk ? "warning" : s.cash) as VerbindingStatus,
      tekst: config.proefmodus ? "Proefmodus: geen boekingen" : !dagboekOk ? "Verkoopdagboek niet ingesteld" : "Boeken in verkoopboek",
    },
  ];
  return (
    <ol className="flow" aria-label="Verwerkingsstappen" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {stappen.map((st, i) => (
        <li key={st.naam} style={{ display: "contents" }}>
          {i > 0 && <ArrowRight className="flow-pijl" size={18} aria-hidden />}
          <div className="flow-stap">
            <strong style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <StatusIcoon status={st.status} size={18} /> {st.naam}
            </strong>
            <span className="toelichting">{st.tekst}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
