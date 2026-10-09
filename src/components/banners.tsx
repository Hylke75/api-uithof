import Link from "next/link";
import type { Configuratie } from "@/lib/dashboard/data";
import { Banner } from "./ui";

/** Proefmodus-, configuratie- en databasebanners; alleen tonen wat de server bevestigt. */
export function StatusBanners({ config, supabaseFout }: { config: Configuratie; supabaseFout?: string | null }) {
  return (
    <>
      {config.proefmodus && (
        <Banner toon="warning" titel="Proefmodus actief. Facturen worden verwerkt, maar NIET in CASH geboekt." />
      )}
      {supabaseFout && (
        <Banner toon="danger" titel="Supabase-verbinding mislukt" actie={<Link className="knop klein" href="/instellingen">Instellingen</Link>}>
          {supabaseFout}. Zolang de database niet bereikbaar is, kan er niet gesynchroniseerd worden.
        </Banner>
      )}
      {config.ontbrekend.length > 0 && (
        <Banner toon="danger" titel="Synchronisatie geblokkeerd: instellingen ontbreken">
          Nog in te stellen in Vercel (Settings → Environment Variables): {config.ontbrekend.join(", ")}.
        </Banner>
      )}
      {config.dagboek.ok && !config.dagboek.data && (
        <Banner toon="warning" titel="Verkoopdagboek nog niet ingesteld">
          Zonder dagboek kan geen enkele factuur in CASH geboekt worden.
        </Banner>
      )}
    </>
  );
}
