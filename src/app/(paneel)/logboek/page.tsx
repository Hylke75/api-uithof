import Link from "next/link";
import { tijd } from "@/components/format";
import { InlineFout, Kaart, Leeg, PageHeader, Pill, type Toon } from "@/components/ui";
import { logboek, type Niveau } from "@/lib/dashboard/data";

const NIVEAU: Record<Niveau, { toon: Toon; label: string }> = {
  fout: { toon: "danger", label: "Fout" },
  waarschuwing: { toon: "warning", label: "Waarschuwing" },
  info: { toon: "info", label: "Info" },
};
const BRONNEN = { run: "Run", batch: "Batch", factuur: "Factuur" } as const;

type Params = { niveau?: string; bron?: string; run?: string };

function href(p: Params) {
  const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v) as [string, string][]).toString();
  return q ? `/logboek?${q}` : "/logboek";
}

export default async function Logboek({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const regels = await logboek();
  const gefilterd = regels.ok
    ? regels.data.filter((r) => (!sp.niveau || r.niveau === sp.niveau) && (!sp.bron || r.bron === sp.bron) && (!sp.run || r.runId === sp.run))
    : [];

  return (
    <>
      <PageHeader
        titel="Logboek"
        intro="Meldingen uit de synchronisatie: per run, per batch en per factuur. Samengesteld uit wat in Supabase is vastgelegd; gevoelige gegevens worden gemaskeerd."
      />
      <Kaart>
        <div className="werkbalk">
          <nav className="filters" aria-label="Filter op niveau">
            <Link className="filter" href={href({ ...sp, niveau: undefined })} aria-current={!sp.niveau ? "true" : undefined}>
              Alle niveaus
            </Link>
            {(Object.keys(NIVEAU) as Niveau[]).map((n) => (
              <Link key={n} className="filter" href={href({ ...sp, niveau: n })} aria-current={sp.niveau === n ? "true" : undefined}>
                {NIVEAU[n].label}
              </Link>
            ))}
          </nav>
          <nav className="filters" aria-label="Filter op bron">
            <Link className="filter" href={href({ ...sp, bron: undefined })} aria-current={!sp.bron ? "true" : undefined}>
              Alle bronnen
            </Link>
            {(Object.keys(BRONNEN) as (keyof typeof BRONNEN)[]).map((b) => (
              <Link key={b} className="filter" href={href({ ...sp, bron: b })} aria-current={sp.bron === b ? "true" : undefined}>
                {BRONNEN[b]}
              </Link>
            ))}
          </nav>
        </div>
        {sp.run && (
          <p className="toelichting">
            Gefilterd op run <code>{sp.run.slice(0, 8)}</code> · <Link href={href({ ...sp, run: undefined })}>filter wissen</Link>
          </p>
        )}

        {!regels.ok ? (
          <InlineFout fout={regels.fout} wat="Logboek" />
        ) : gefilterd.length === 0 ? (
          <Leeg>Geen meldingen voor deze filters.</Leeg>
        ) : (
          <div className="tabel-wrap">
            <table>
              <caption className="sr-only">Logboekregels, nieuwste eerst</caption>
              <thead>
                <tr>
                  <th scope="col">Tijd</th>
                  <th scope="col">Niveau</th>
                  <th scope="col">Bron</th>
                  <th scope="col">Bericht</th>
                  <th scope="col">Context</th>
                  <th scope="col">Run</th>
                </tr>
              </thead>
              <tbody>
                {gefilterd.slice(0, 300).map((r, i) => (
                  <tr key={i}>
                    <td>{tijd(r.tijd)}</td>
                    <td>
                      <Pill toon={NIVEAU[r.niveau].toon}>{NIVEAU[r.niveau].label}</Pill>
                    </td>
                    <td>{BRONNEN[r.bron]}</td>
                    <td className="breed">{r.bericht}</td>
                    <td className="muted">{r.context}</td>
                    <td>{r.runId ? <Link href={href({ ...sp, run: r.runId })}>{r.runId.slice(0, 8)}</Link> : <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Kaart>
    </>
  );
}
