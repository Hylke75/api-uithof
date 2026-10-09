import { AlertTriangle, CheckCircle2, ChevronRight, CircleHelp, Info, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { VerbindingStatus } from "@/lib/dashboard/resultaat";

/** Gedeelde, server-renderbare UI-onderdelen volgens design-brief/02-DESIGN-SYSTEM.md. */

export type Toon = "success" | "warning" | "danger" | "info" | "neutral";

export function Pill({ toon, children, icoon = true }: { toon: Toon; children: ReactNode; icoon?: boolean }) {
  const I = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle, info: Info, neutral: CircleHelp }[toon];
  return (
    <span className={`pill ${toon}`}>
      {icoon && <I size={13} strokeWidth={2.2} aria-hidden />}
      {children}
    </span>
  );
}

const FACTUUR_TOON: Record<string, Toon> = { proef: "warning", nieuw: "warning", geboekt: "success", fout: "danger", gewijzigd_na_boeking: "danger" };
const FACTUUR_LABEL: Record<string, string> = {
  proef: "Proef (niet geboekt)",
  nieuw: "Uitkomst onbekend",
  geboekt: "Geboekt",
  fout: "Fout",
  gewijzigd_na_boeking: "Gewijzigd na boeking",
};
export function FactuurStatusPill({ status }: { status: string }) {
  return <Pill toon={FACTUUR_TOON[status] ?? "neutral"}>{FACTUUR_LABEL[status] ?? status}</Pill>;
}

const RUN_TOON: Record<string, Toon> = { success: "success", partial: "warning", failed: "danger", running: "info" };
const RUN_LABEL: Record<string, string> = { success: "Geslaagd", partial: "Deels gelukt", failed: "Mislukt", running: "Bezig" };
export function RunStatusPill({ status }: { status: string }) {
  return <Pill toon={RUN_TOON[status] ?? "neutral"}>{RUN_LABEL[status] ?? status}</Pill>;
}

const VERB: Record<VerbindingStatus, { toon: Toon; label: string }> = {
  healthy: { toon: "success", label: "Verbonden" },
  error: { toon: "danger", label: "Verbinding mislukt" },
  warning: { toon: "warning", label: "Aandacht nodig" },
  unknown: { toon: "neutral", label: "Niet gecontroleerd" },
};
export function VerbindingPill({ status }: { status: VerbindingStatus }) {
  return <Pill toon={VERB[status].toon}>{VERB[status].label}</Pill>;
}

export function StatusIcoon({ status, size = 22 }: { status: VerbindingStatus; size?: number }) {
  if (status === "healthy") return <CheckCircle2 size={size} color="var(--color-success)" aria-label="Verbonden" />;
  if (status === "error") return <XCircle size={size} color="var(--color-danger)" aria-label="Verbinding mislukt" />;
  if (status === "warning") return <AlertTriangle size={size} color="var(--color-warning)" aria-label="Aandacht nodig" />;
  return <CircleHelp size={size} color="var(--color-muted)" aria-label="Niet gecontroleerd" />;
}

export function PageHeader({ eyebrow, titel, intro, acties }: { eyebrow?: string; titel: string; intro?: ReactNode; acties?: ReactNode }) {
  return (
    <header className="paginakop">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{titel}</h1>
        {intro && <p className="intro">{intro}</p>}
      </div>
      {acties && <div className="acties">{acties}</div>}
    </header>
  );
}

export function Kaart({ titel, icoon, actie, children, id }: { titel?: ReactNode; icoon?: ReactNode; actie?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section className="kaart" aria-labelledby={id}>
      {(titel || actie) && (
        <div className="kaart-kop">
          <div className="kop-links">
            {icoon}
            {titel && <h2 id={id}>{titel}</h2>}
          </div>
          {actie}
        </div>
      )}
      {children}
    </section>
  );
}

export function Banner({ toon, titel, children, actie }: { toon: "warning" | "danger" | "success" | "info"; titel: ReactNode; children?: ReactNode; actie?: ReactNode }) {
  const I = { warning: AlertTriangle, danger: XCircle, success: CheckCircle2, info: Info }[toon];
  return (
    <div className={`banner ${toon}`} role={toon === "danger" ? "alert" : "status"}>
      <I size={20} aria-hidden style={{ flex: "none", marginTop: 1 }} />
      <div className="banner-tekst">
        <strong>{titel}</strong>
        {children && <p>{children}</p>}
      </div>
      {actie}
    </div>
  );
}

export function Leeg({ children }: { children: ReactNode }) {
  return <p className="leeg">{children}</p>;
}

/** Foutstaat binnen een sectie: nooit nullen tonen als het ophalen mislukte. */
export function InlineFout({ fout, wat = "Gegevens" }: { fout: string; wat?: string }) {
  return (
    <Banner toon="danger" titel={`${wat} niet beschikbaar. Controleer de API-verbinding.`}>
      {fout}
    </Banner>
  );
}

export function Kpi({ toon, icoon, label, waarde, href, uitleg }: { toon: "info" | "warning" | "success" | "danger"; icoon: ReactNode; label: string; waarde: number | null; href: string; uitleg?: string }) {
  return (
    <Link className={`kpi ${toon}`} href={href} aria-label={`${label}: ${waarde ?? "niet beschikbaar"}. Bekijk facturen`}>
      <span className="kpi-icoon" aria-hidden>
        {icoon}
      </span>
      <span>
        <span className="kpi-label">{label}</span>
        <br />
        <span className="kpi-waarde">{waarde ?? "—"}</span>
        {waarde == null && uitleg && (
          <>
            <br />
            <span className="toelichting">{uitleg}</span>
          </>
        )}
      </span>
      <ChevronRight className="kpi-pijl" size={20} aria-hidden />
    </Link>
  );
}

export function Laden({ hoogte = 120, label = "Laden" }: { hoogte?: number; label?: string }) {
  return (
    <div className="skelet" style={{ minHeight: hoogte }} aria-busy="true" role="status">
      <span className="sr-only">
        <Loader2 aria-hidden /> {label}…
      </span>
    </div>
  );
}
