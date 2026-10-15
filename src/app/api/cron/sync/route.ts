import { NextResponse, type NextRequest } from "next/server";
import { weigerZonderCronGeheim } from "@/lib/auth";
import { redigeer } from "@/lib/dashboard/resultaat";
import { startSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Aangeroepen door Vercel Cron (zie vercel.json). */
export async function GET(req: NextRequest) {
  const geweigerd = weigerZonderCronGeheim(req);
  if (geweigerd) return geweigerd;

  try {
    const r = await startSync("cron");
    const veilig = { ...r, meldingen: r.meldingen.map(redigeer), ...(r.error ? { error: redigeer(r.error) } : {}) };
    return NextResponse.json(veilig, { status: r.status === "failed" ? 500 : 200 });
  } catch (e) {
    // Fout vóór de run gestart kon worden (bijv. database niet bereikbaar): geen sleutels in de melding.
    const melding = redigeer(e instanceof Error ? e.message : String(e));
    console.error("Sync niet gestart:", melding);
    return NextResponse.json({ status: "failed", error: `Sync niet gestart: ${melding}` }, { status: 500 });
  }
}
