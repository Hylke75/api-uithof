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
    const decoded = atob(header.slice(6));
    const i = decoded.indexOf(":");
    if (i >= 0 && safeEqual(decoded.slice(0, i).trim(), user) && safeEqual(decoded.slice(i + 1).trim(), password)) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Inloggen vereist", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Uithof sync", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon.ico).*)"],
};
