import { Suspense } from "react";
import { Logo, MobielMenu, Nav } from "@/components/navigatie";
import { SysteemStatus } from "@/components/verbinding";

export const dynamic = "force-dynamic";

function StatusPlaats() {
  return (
    <Suspense
      fallback={
        <div className="systeemstatus" aria-busy="true">
          <strong>
            <span className="stip unknown" aria-hidden />
            <span className="label">Controleren…</span>
          </strong>
        </div>
      }
    >
      <SysteemStatus />
    </Suspense>
  );
}

export default function PaneelLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Navigatie">
        <Logo />
        <Nav />
        <div className="sidebar-voet">
          <StatusPlaats />
        </div>
      </aside>
      <div className="hoofd">
        <MobielMenu status={<StatusPlaats />} />
        <main className="inhoud" id="inhoud">
          {children}
        </main>
      </div>
    </div>
  );
}
