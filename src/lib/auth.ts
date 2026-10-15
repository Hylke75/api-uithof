import { NextResponse } from "next/server";
import { leesEnv } from "@/lib/env";

/** Vergelijkt twee strings in constante tijd (ten opzichte van de lengte van `b`). */
export function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Controle voor de beheerroutes onder /api/cron: `Authorization: Bearer $CRON_SECRET`.
 * Geeft een foutantwoord terug, of null als de aanvraag mag. Faalt dicht als het geheim
 * ontbreekt of te kort is.
 */
export function weigerZonderCronGeheim(req: Request): NextResponse | null {
  const geheim = leesEnv("CRON_SECRET") ?? "";
  if (geheim.length < 16) return NextResponse.json({ error: "niet geconfigureerd" }, { status: 503 });
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${geheim}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
