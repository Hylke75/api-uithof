import { NextResponse, type NextRequest } from "next/server";
import { weigerZonderCronGeheim } from "@/lib/auth";
import { redigeer } from "@/lib/dashboard/resultaat";
import { leesEnv } from "@/lib/env";
import { db } from "@/lib/supabase";
import { TEST_ADMINISTRATIE } from "@/lib/sync";

export const dynamic = "force-dynamic";

/**
 * Alleen voor administratie "demo"; weigert in productie.
 * POST /api/cron/testdata-opruimen?facturen=21396,21397[&debiteuren=50246]
 * Verwijdert testfacturen en testdebiteurkoppelingen uit de database, zodat ze niet in de weg
 * zitten bij het live gaan.
 */
export async function POST(req: NextRequest) {
  const geweigerd = weigerZonderCronGeheim(req);
  if (geweigerd) return geweigerd;
  if (leesEnv("CASH_ADMINISTRATIE") !== TEST_ADMINISTRATIE) return NextResponse.json({ error: "alleen in de testadministratie" }, { status: 400 });

  const lijst = (naam: string) => (req.nextUrl.searchParams.get(naam) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const facturen = lijst("facturen");
  const debiteuren = lijst("debiteuren");
  const sb = db();

  const f = facturen.length ? await sb.from("sem_facturen").delete().in("sem_factuur_id", facturen).select("sem_factuur_id") : { data: [], error: null };
  const d = debiteuren.length ? await sb.from("map_debiteur").delete().in("sem_debiteurnummer", debiteuren).select("sem_debiteurnummer") : { data: [], error: null };
  const fout = f.error?.message ?? d.error?.message;
  if (fout) return NextResponse.json({ error: redigeer(fout) }, { status: 500 });
  return NextResponse.json({ facturenVerwijderd: f.data?.length ?? 0, debiteurenVerwijderd: d.data?.length ?? 0 });
}
