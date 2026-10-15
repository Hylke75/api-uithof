import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/auth";
import { leesEnv } from "@/lib/env";

/** Basic Auth voor de beheerpagina. De cron-route heeft een eigen controle. */
export function proxy(req: NextRequest) {
  const user = leesEnv("ADMIN_USER");
  const password = leesEnv("ADMIN_PASSWORD");
  if (!user || !password) {
    return new NextResponse("Beheerpagina niet geconfigureerd", { status: 503 });
  }

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6).trim());
    } catch {
      /* ongeldige base64: behandelen als niet ingelogd */
    }
    const i = decoded.indexOf(":");
    // Beide altijd vergelijken, zodat de tijd niet verraadt of de gebruikersnaam klopt.
    const naamOk = safeEqual(i >= 0 ? decoded.slice(0, i) : "", user);
    const wachtwoordOk = safeEqual(i >= 0 ? decoded.slice(i + 1) : "", password);
    if (naamOk && wachtwoordOk) return NextResponse.next();
  }

  return new NextResponse("Inloggen vereist", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Uithof sync", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/cron/|_next/static/|_next/image|favicon.ico).*)"],
};
