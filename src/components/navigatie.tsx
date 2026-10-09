"use client";

import { FileText, Home, Layers, Menu, Repeat, ScrollText, Settings, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const ITEMS = [
  { href: "/", label: "Overzicht", icoon: Home },
  { href: "/facturen", label: "Facturen", icoon: FileText },
  { href: "/batches", label: "Batches", icoon: Layers },
  { href: "/runs", label: "Runs", icoon: Repeat },
  { href: "/instellingen", label: "Instellingen", icoon: Settings },
  { href: "/logboek", label: "Logboek", icoon: ScrollText },
];

function actief(pad: string, href: string) {
  if (href === "/") return pad === "/" || pad === "/controle";
  return pad === href || pad.startsWith(`${href}/`) || (href === "/facturen" && pad.startsWith("/voorbeeld"));
}

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Uithof facturensync, naar overzicht">
      <span className="logo-u" aria-hidden />
      <span className="logo-tekst">
        Uithof
        <br />
        facturensync
      </span>
    </Link>
  );
}

export function Nav({ onKies }: { onKies?: () => void }) {
  const pad = usePathname();
  return (
    <nav className="nav" aria-label="Hoofdmenu">
      {ITEMS.map(({ href, label, icoon: I }) => (
        <Link key={href} href={href} aria-current={actief(pad, href) ? "page" : undefined} title={label} onClick={onKies}>
          <I size={19} strokeWidth={1.8} aria-hidden />
          <span className="label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Mobiel: menu als lade, sluit met Escape, klik buiten of na navigatie. */
export function MobielMenu({ status }: { status: ReactNode }) {
  const [open, setOpen] = useState(false);
  const knop = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const toets = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("keydown", toets);
      knop.current?.focus();
    };
  }, [open]);

  return (
    <div className="mobiel-balk">
      <Logo />
      <button ref={knop} className="knop klein" aria-expanded={open} aria-controls="mobiel-menu" onClick={() => setOpen(true)}>
        <Menu size={18} aria-hidden /> Menu
      </button>
      {open && (
        <div className="lade" onClick={() => setOpen(false)}>
          <div id="mobiel-menu" className="lade-paneel" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Logo />
              <button className="knop klein" onClick={() => setOpen(false)} autoFocus aria-label="Menu sluiten">
                <X size={18} aria-hidden />
              </button>
            </div>
            <Nav onKies={() => setOpen(false)} />
            {status}
          </div>
        </div>
      )}
    </div>
  );
}
