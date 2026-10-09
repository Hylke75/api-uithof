/** Uitkomst van een server-side ophaalactie: data, of een veilige foutmelding (nooit een sleutel). */
export type Resultaat<T> = { ok: true; data: T } | { ok: false; fout: string };

/** Lange token-achtige reeksen (API-keys, JWT's) maskeren in meldingen. */
export function redigeer(tekst: string): string {
  return tekst
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[token verborgen]")
    .replace(/\b(sb_(secret|publishable)_)[A-Za-z0-9_-]+/g, "$1…")
    // Lange reeksen met minstens één cijfer (sleutels, GUID's); paden met "/" blijven leesbaar.
    .replace(/\b(?=[A-Za-z_+-]*\d)[A-Za-z0-9+_-]{32,}={0,2}/g, "[sleutel verborgen]");
}

export async function probeer<T>(f: () => Promise<T>): Promise<Resultaat<T>> {
  try {
    return { ok: true, data: await f() };
  } catch (e) {
    return { ok: false, fout: redigeer(e instanceof Error ? e.message : String(e)) };
  }
}

export type VerbindingStatus = "healthy" | "error" | "warning" | "unknown";

/** Overall systeemstatus: nooit groen als één kritiek onderdeel faalt. */
export function systeemStatus(statussen: VerbindingStatus[]): VerbindingStatus {
  if (statussen.length === 0 || statussen.every((s) => s === "unknown")) return "unknown";
  if (statussen.some((s) => s === "error" || s === "warning")) return "warning";
  if (statussen.some((s) => s === "unknown")) return "warning";
  return "healthy";
}
