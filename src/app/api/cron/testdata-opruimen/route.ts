import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { leesEnv } from "@/lib/env";
import { db } from "@/lib/supabase";
import { TEST_ADMINISTRATIE } from "@/lib/sync";

export const dynamic = "force-dynamic";

/**
 * POST /api/cron/testdata-opruimen?facturen=1965,1989&debiteuren=50246
 * Verwijdert facturen en debiteurkoppelingen uit de SEM-testomgeving uit de database, zodat ze
 * niet botsen met de echte SEM-gegevens. Alleen zolang er in CASH-administratie "demo" wordt geboekt.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${leesEnv("CRON_SECRET") ?? ""}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (leesEnv("CASH_ADMINISTRATIE") !== TEST_ADMINISTRATIE) return NextResponse.json({ error: "alleen in de testadministratie" }, { status: 400 });

  const lijst = (naam: string) => (req.nextUrl.searchParams.get(naam) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const facturen = lijst("facturen");
  const debiteuren = lijst("debiteuren");
  const sb = db();

  const f = facturen.length ? await sb.from("sem_facturen").delete().in("sem_factuur_id", facturen).select("sem_factuur_id") : { data: [], error: null };
  const d = debiteuren.length ? await sb.from("map_debiteur").delete().in("sem_debiteurnummer", debiteuren).select("sem_debiteurnummer") : { data: [], error: null };
  const fout = f.error?.message ?? d.error?.message;
  if (fout) return NextResponse.json({ error: fout }, { status: 500 });
  return NextResponse.json({ facturenVerwijderd: f.data?.length ?? 0, debiteurenVerwijderd: d.data?.length ?? 0 });
}
