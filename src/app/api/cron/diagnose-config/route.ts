import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { leesEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Waar de instellingen naar wijzen, zonder geheimen: alleen hosts en de vorm van de sleutels. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${leesEnv("CRON_SECRET") ?? ""}`)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const host = (naam: string) => {
    const v = leesEnv(naam);
    if (!v) return null;
    try {
      return new URL(v).host;
    } catch {
      return "geen geldige URL";
    }
  };
  const vorm = (naam: string) => {
    const v = leesEnv(naam);
    if (!v) return null;
    const soort = v.startsWith("sb_secret_") ? "sb_secret" : v.startsWith("sb_publishable_") ? "sb_publishable" : v.startsWith("eyJ") ? "jwt" : /^[0-9a-f-]{36}$/i.test(v) ? "guid" : "anders";
    return { lengte: v.length, soort };
  };

  return NextResponse.json({
    SUPABASE_URL: host("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: vorm("SUPABASE_SERVICE_ROLE_KEY"),
    SEM_BASE_URL: host("SEM_BASE_URL"),
    SEM_API_KEY: vorm("SEM_API_KEY"),
    CASH_BASE_URL: host("CASH_BASE_URL"),
    CASH_API_KEY: vorm("CASH_API_KEY"),
    CASH_ADMINISTRATIE: leesEnv("CASH_ADMINISTRATIE") ?? null,
    SYNC_DRY_RUN: leesEnv("SYNC_DRY_RUN") ?? null,
  });
}
