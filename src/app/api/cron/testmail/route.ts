import { NextResponse, type NextRequest } from "next/server";
import { weigerZonderCronGeheim } from "@/lib/auth";
import { meldRun } from "@/lib/melding";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/testmail[?soort=fout]
 * Stuurt een voorbeeldmail (samenvatting of fout) naar de ingestelde ontvanger, om te controleren
 * dat de meldingen aankomen. Boekt niets.
 */
export async function POST(req: NextRequest) {
  const geweigerd = weigerZonderCronGeheim(req);
  if (geweigerd) return geweigerd;
  const fout = req.nextUrl.searchParams.get("soort") === "fout";
  const vandaag = new Date().toISOString().slice(0, 10);
  const uitkomst = await meldRun({
    runId: "00000000-0000-0000-0000-000000000000",
    status: fout ? "partial" : "success",
    windowFrom: vandaag,
    windowTo: `${vandaag}, testmail`,
    meldingen: fout ? ["Dit is een testmelding; er is niets misgegaan."] : [],
    n_batches: 0,
    n_opgehaald: 0,
    n_geboekt: 0,
    n_proef: 0,
    n_overgeslagen: 0,
    n_fout: fout ? 1 : 0,
  });
  return NextResponse.json({ uitkomst });
}
