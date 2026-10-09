"use client";

import { Loader2, Play, RefreshCw, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { startSyncActie, verbindingenControlerenActie, type SyncUitkomst } from "@/app/acties";

/** "Sync nu starten": uitgeschakeld tijdens het verzoek, uitkomst blijft zichtbaar op de pagina. */
export function SyncKnop({ proefmodus }: { proefmodus: boolean }) {
  const [bezig, start] = useTransition();
  const [uitkomst, setUitkomst] = useState<SyncUitkomst | null>(null);
  const router = useRouter();

  function klik() {
    if (bezig) return;
    if (!proefmodus && !window.confirm("Proefmodus staat UIT: facturen worden echt in CASH geboekt. Doorgaan?")) return;
    setUitkomst(null);
    start(async () => {
      setUitkomst(await startSyncActie());
      router.refresh();
    });
  }

  return (
    <>
      <button className="knop primair" onClick={klik} disabled={bezig} aria-busy={bezig}>
        {bezig ? <Loader2 size={18} className="draai" aria-hidden /> : <Play size={18} aria-hidden />}
        {bezig ? "Synchroniseren…" : "Sync nu starten"}
      </button>
      {uitkomst && (
        <div className={`banner ${uitkomst.ok ? "success" : "danger"}`} role={uitkomst.ok ? "status" : "alert"} style={{ flexBasis: "100%" }}>
          <div className="banner-tekst">
            <strong>{uitkomst.bericht}</strong>
            {uitkomst.details?.map((d, i) => (
              <p key={i}>{d}</p>
            ))}
          </div>
          <button className="knop klein" onClick={() => setUitkomst(null)} aria-label="Melding sluiten">
            Sluiten
          </button>
        </div>
      )}
    </>
  );
}

/** "Verbindingen controleren": alleen-lezende hercontrole van Supabase, SEM en CASH. */
export function ControleerKnop({ label = "Verbindingen controleren", klein = false }: { label?: string; klein?: boolean }) {
  const [bezig, start] = useTransition();
  const router = useRouter();
  return (
    <button
      className={`knop${klein ? " klein" : ""}`}
      disabled={bezig}
      aria-busy={bezig}
      onClick={() =>
        start(async () => {
          await verbindingenControlerenActie();
          router.refresh();
        })
      }
    >
      {bezig ? <Loader2 size={18} className="draai" aria-hidden /> : klein ? <RefreshCw size={16} aria-hidden /> : <Settings2 size={18} aria-hidden />}
      {bezig ? "Controleren…" : label}
    </button>
  );
}
